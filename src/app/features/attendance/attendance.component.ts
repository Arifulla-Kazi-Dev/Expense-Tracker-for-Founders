import { NgClass } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';

import { AttendanceRecord, AttendanceToken, Holiday, HolidayInput } from '../../core/models/attendance.model';
import { CompanyMember } from '../../core/models/company.model';
import { HolidayRegion, INDIA_PUBLIC_HOLIDAYS, REGION_LABELS, holidaysForYear } from '../../core/data/india-holidays.data';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { AttendanceService } from '../../core/services/attendance.service';
import { AttendanceTokenService } from '../../core/services/attendance-token.service';
import { AuthService } from '../../core/services/auth.service';
import { HolidayService } from '../../core/services/holiday.service';
import { MemberService } from '../../core/services/member.service';
import { PermissionService } from '../../core/services/permission.service';
import { parseIsoDate, toIsoDate } from '../../core/utils/date-cycles';
import { textValue } from '../../core/utils/feature-form-values';
import { CalendarMarker, CalendarMonthComponent } from '../../shared/components/calendar-month/calendar-month.component';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

interface MonthStats {
  present: number;
  absent: number;
  percentage: number;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [FormsModule, NgClass, LucideDynamicIcon, CalendarMonthComponent, FeaturePageComponent],
  templateUrl: './attendance.component.html',
})
export class AttendanceComponent implements OnDestroy {
  private readonly permissionService = inject(PermissionService);
  private readonly authService = inject(AuthService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly attendanceTokenService = inject(AttendanceTokenService);
  private readonly holidayService = inject(HolidayService);
  private readonly memberService = inject(MemberService);

  private readonly records = toSignal(this.attendanceService.list(), { initialValue: [] as AttendanceRecord[] });
  private readonly holidays = toSignal(this.holidayService.list(), { initialValue: [] as Holiday[] });
  private readonly members = toSignal(this.memberService.members$, { initialValue: [] as CompanyMember[] });
  readonly todayToken = toSignal(this.attendanceTokenService.todayToken$, { initialValue: null as AttendanceToken | null });
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });

  tokenInput = '';
  isCheckingIn = false;
  checkInError = '';
  selectedUid = '';
  memberPickerOpen = false;

  holidayLoadYear = new Date().getFullYear();
  holidayRegion: HolidayRegion | '' = '';
  isLoadingHolidays = false;

  readonly regionOptions: { value: HolidayRegion | ''; label: string }[] = [
    { value: '', label: 'All-India only' },
    ...(Object.entries(REGION_LABELS) as [HolidayRegion, string][]).map(([value, label]) => ({ value, label })),
  ];

  isBusy = false;
  errorMessage = '';
  toastMessage = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  private viewedYear = new Date().getFullYear();
  private viewedMonth = new Date().getMonth();

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  canManage(): boolean {
    return this.permissionService.can('manageAttendance');
  }

  /** Founders/co-founders run the company; attendance tracking is for their team, not themselves. */
  get isFounderOrCofounder(): boolean {
    const role = this.permissionService.currentRole;
    return role === 'founder' || role === 'cofounder';
  }

  get currentUid(): string | null {
    return this.authService.currentUser?.uid ?? null;
  }

  /** Selectable for attendance viewing/tracking — excludes founder/co-founder, who aren't tracked. */
  get activeMembers(): CompanyMember[] {
    return this.members().filter(
      (member) => member.status === 'active' && member.role !== 'founder' && member.role !== 'cofounder',
    );
  }

  get today(): string {
    return toIsoDate(new Date());
  }

  get isTodayOff(): boolean {
    return isWeekend(this.today) || this.holidays().some((holiday) => holiday.date === this.today);
  }

  get hasCheckedInToday(): boolean {
    const uid = this.currentUid;

    if (!uid) {
      return false;
    }

    return this.records().some((record) => record.uid === uid && record.date === this.today);
  }

  get viewedUid(): string {
    if (this.selectedUid) {
      return this.selectedUid;
    }

    if (!this.isFounderOrCofounder && this.currentUid) {
      return this.currentUid;
    }

    return this.activeMembers[0]?.uid ?? '';
  }

  get viewedMemberName(): string {
    if (!this.selectedUid && !this.isFounderOrCofounder) {
      return this.profile()?.name ?? 'Me';
    }

    return this.activeMembers.find((member) => member.uid === this.viewedUid)?.name ?? 'Select a team member';
  }

  get viewedMemberInitials(): string {
    return initialsFor(this.viewedMemberName);
  }

  toggleMemberPicker(): void {
    this.memberPickerOpen = !this.memberPickerOpen;
  }

  closeMemberPicker(): void {
    this.memberPickerOpen = false;
  }

  selectMember(uid: string): void {
    this.selectedUid = uid;
    this.memberPickerOpen = false;
  }

  initials(name: string): string {
    return initialsFor(name);
  }

  get calendarMarkers(): CalendarMarker[] {
    const uid = this.viewedUid;

    if (!uid) {
      return [];
    }

    return this.markersForMonth(this.viewedYear, this.viewedMonth, uid);
  }

  get monthStats(): MonthStats {
    const relevant = this.calendarMarkers.filter((marker) => marker.label === 'Present' || marker.label === 'Absent');
    const present = relevant.filter((marker) => marker.label === 'Present').length;
    const absent = relevant.filter((marker) => marker.label === 'Absent').length;
    const total = present + absent;

    return { present, absent, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
  }

  onMonthChange(change: { year: number; month: number }): void {
    this.viewedYear = change.year;
    this.viewedMonth = change.month;
  }

  async submitToken(): Promise<void> {
    const token = this.tokenInput.trim();

    if (!token || this.isCheckingIn) {
      return;
    }

    this.isCheckingIn = true;
    this.checkInError = '';

    try {
      await this.attendanceService.checkIn(token, this.profile()?.name ?? 'Member');
      this.tokenInput = '';
      this.showToast("You're marked present today.");
    } catch (error) {
      this.checkInError = error instanceof Error ? error.message : 'Unable to mark attendance.';
    } finally {
      this.isCheckingIn = false;
    }
  }

  async regenerateToken(): Promise<void> {
    try {
      await this.attendanceTokenService.regenerateToday();
      this.showToast("Today's code was regenerated.");
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to regenerate the code.';
    }
  }

  get holidayFeature(): FeaturePageConfig {
    return {
      eyebrow: 'Attendance',
      title: 'Company holidays',
      description: 'Days that never count as absent, on top of Saturdays and Sundays.',
      icon: 'calendar-clock',
      primaryAction: 'Add Holiday',
      secondaryAction: 'Realtime',
      formTitle: 'Add holiday',
      emptyTitle: 'No holidays added yet',
      emptyDescription: 'Add company holidays so they never count as absences.',
      collapsible: true,
      fields: [
        { name: 'date', label: 'Start date', type: 'date', required: true },
        {
          name: 'endDate',
          label: 'End date',
          type: 'date',
          hint: 'Leave blank for a single day, or set an end date to add every day in between as a holiday (e.g. a Diwali break). Only used when adding a new holiday, not when editing one.',
        },
        { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Diwali' },
      ],
      stats: [],
      rows: [],
    };
  }

  get holidayRows(): FeaturePageRow[] {
    return [...this.holidays()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((holiday) => ({
        id: holiday.id,
        title: holiday.name,
        meta: this.formatDate(holiday.date),
        status: 'Ready',
        amount: '',
        raw: holiday as unknown as Record<string, unknown>,
      }));
  }

  async saveHoliday(event: FeatureSaveEvent): Promise<void> {
    const name = textValue(event.value, 'name');
    const startDate = textValue(event.value, 'date');

    if (event.id) {
      const payload: HolidayInput = { date: startDate, name };
      await this.runMutation(() => this.holidayService.update(event.id!, payload), 'Holiday updated');
      return;
    }

    const endDate = textValue(event.value, 'endDate');
    const dates = expandDateRange(startDate, endDate);
    const existingDates = new Set(this.holidays().map((holiday) => holiday.date));
    const toCreate = dates.filter((date) => !existingDates.has(date)).map((date) => ({ date, name }));

    if (!toCreate.length) {
      this.showToast('Those dates are already added.');
      return;
    }

    await this.runMutation(
      () => this.holidayService.bulkCreate(toCreate),
      `Added ${toCreate.length} holiday${toCreate.length === 1 ? '' : 's'}`,
    );
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.runMutation(() => this.holidayService.delete(id), 'Holiday removed');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Attendance updates automatically.');
  }

  get holidayLoadYears(): number[] {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }

  get holidayLoadYearHasCuratedList(): boolean {
    return this.holidayLoadYear in INDIA_PUBLIC_HOLIDAYS;
  }

  async loadStandardHolidays(): Promise<void> {
    const existingDates = new Set(this.holidays().map((holiday) => holiday.date));
    const candidates = holidaysForYear(this.holidayLoadYear, this.holidayRegion).filter(
      (item) => !existingDates.has(item.date),
    );

    if (!candidates.length) {
      this.showToast(`${this.holidayLoadYear}'s holidays are already added.`);
      return;
    }

    this.isLoadingHolidays = true;
    this.errorMessage = '';

    try {
      const added = await this.holidayService.bulkCreate(candidates);
      const regionLabel = this.holidayRegion ? ` (${REGION_LABELS[this.holidayRegion]})` : '';
      this.showToast(`Added ${added} holiday${added === 1 ? '' : 's'} for ${this.holidayLoadYear}${regionLabel}.`);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to add holidays.';
    } finally {
      this.isLoadingHolidays = false;
    }
  }

  formatDate(value: string): string {
    const date = parseIsoDate(value);
    return date
      ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
      : value;
  }

  private markersForMonth(year: number, month: number, uid: string): CalendarMarker[] {
    const today = this.today;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const markers: CalendarMarker[] = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = toIsoDate(new Date(year, month, day));

      if (date > today) {
        continue;
      }

      if (isWeekend(date)) {
        markers.push({ date, tone: 'slate', fill: true, label: 'Weekend' });
        continue;
      }

      const holiday = this.holidays().find((item) => item.date === date);

      if (holiday) {
        markers.push({ date, tone: 'sky', fill: true, label: holiday.name });
        continue;
      }

      const present = this.records().some((record) => record.uid === uid && record.date === date);
      markers.push(present
        ? { date, tone: 'emerald', fill: true, label: 'Present' }
        : { date, tone: 'rose', fill: true, label: 'Absent' });
    }

    return markers;
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save.';
    } finally {
      this.isBusy = false;
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2400);
  }
}

function isWeekend(dateIso: string): boolean {
  const date = parseIsoDate(dateIso);

  if (!date) {
    return false;
  }

  const day = date.getDay();
  return day === 0 || day === 6;
}

const MAX_HOLIDAY_RANGE_DAYS = 45;

/** Every ISO date from start to end inclusive, capped as a safety valve against a typo'd end date. */
function expandDateRange(start: string, end: string): string[] {
  const startDate = parseIsoDate(start);

  if (!startDate) {
    return [];
  }

  const endDate = end ? parseIsoDate(end) : null;

  if (!endDate || endDate <= startDate) {
    return [start];
  }

  const dates: string[] = [];
  const cursor = new Date(startDate);

  while (toIsoDate(cursor) <= toIsoDate(endDate) && dates.length < MAX_HOLIDAY_RANGE_DAYS) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return '?';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

