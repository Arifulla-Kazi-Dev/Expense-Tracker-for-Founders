import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';

import { AttendanceRecord, AttendanceToken, Holiday, HolidayInput } from '../../core/models/attendance.model';
import { CompanyMember } from '../../core/models/company.model';
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
  imports: [FormsModule, LucideDynamicIcon, CalendarMonthComponent, FeaturePageComponent],
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

  showBulkImport = false;
  bulkText = '';
  bulkResultMessage = '';
  isBulkImporting = false;
  nationalHolidayYear = new Date().getFullYear();

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

  get currentUid(): string | null {
    return this.authService.currentUser?.uid ?? null;
  }

  get activeMembers(): CompanyMember[] {
    return this.members().filter((member) => member.status === 'active');
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
    return this.selectedUid || this.currentUid || '';
  }

  get viewedMemberName(): string {
    if (!this.selectedUid || this.selectedUid === this.currentUid) {
      return this.profile()?.name ?? 'Me';
    }

    return this.activeMembers.find((member) => member.uid === this.selectedUid)?.name ?? 'Member';
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
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
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
    const payload: HolidayInput = {
      date: textValue(event.value, 'date'),
      name: textValue(event.value, 'name'),
    };

    await this.runMutation(
      () => event.id ? this.holidayService.update(event.id, payload) : this.holidayService.create(payload),
      event.id ? 'Holiday updated' : 'Holiday added',
    );
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.runMutation(() => this.holidayService.delete(id), 'Holiday removed');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Attendance updates automatically.');
  }

  get nationalHolidayYears(): number[] {
    const current = new Date().getFullYear();
    return [current, current + 1];
  }

  async addNationalHolidays(): Promise<void> {
    const existingDates = new Set(this.holidays().map((holiday) => holiday.date));
    const candidates = nationalHolidaysForYear(this.nationalHolidayYear).filter(
      (item) => !existingDates.has(item.date),
    );

    if (!candidates.length) {
      this.showToast('Those national holidays are already added.');
      return;
    }

    this.isBusy = true;
    this.errorMessage = '';

    try {
      const added = await this.holidayService.bulkCreate(candidates);
      this.showToast(`Added ${added} national holiday${added === 1 ? '' : 's'}.`);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to add national holidays.';
    } finally {
      this.isBusy = false;
    }
  }

  toggleBulkImport(): void {
    this.showBulkImport = !this.showBulkImport;
    this.bulkResultMessage = '';
  }

  async importBulkHolidays(): Promise<void> {
    const parsed = parseBulkHolidayText(this.bulkText);

    if (!parsed.items.length) {
      this.bulkResultMessage = 'No valid lines found. Use one holiday per line: YYYY-MM-DD, Name';
      return;
    }

    const existingDates = new Set(this.holidays().map((holiday) => holiday.date));
    const toCreate = parsed.items.filter((item) => !existingDates.has(item.date));
    const duplicateCount = parsed.items.length - toCreate.length;

    this.isBulkImporting = true;
    this.errorMessage = '';

    try {
      const added = await this.holidayService.bulkCreate(toCreate);
      const parts = [`Added ${added} holiday${added === 1 ? '' : 's'}`];

      if (duplicateCount) {
        parts.push(`skipped ${duplicateCount} already added`);
      }

      if (parsed.invalidLines.length) {
        parts.push(`skipped ${parsed.invalidLines.length} unreadable line${parsed.invalidLines.length === 1 ? '' : 's'}`);
      }

      this.bulkResultMessage = `${parts.join(', ')}.`;
      this.bulkText = '';
      this.showToast('Holidays imported.');
    } catch (error) {
      this.bulkResultMessage = error instanceof Error ? error.message : 'Unable to import holidays.';
    } finally {
      this.isBulkImporting = false;
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

/**
 * India's only nationwide, fixed-date public holidays. Festival holidays (Diwali, Holi,
 * Eid, etc.) follow lunar/regional calendars that shift every year and vary by state, so
 * they can't be safely auto-generated — those go through the bulk-paste importer instead.
 */
function nationalHolidaysForYear(year: number): { date: string; name: string }[] {
  return [
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
  ];
}

function parseBulkHolidayText(text: string): { items: HolidayInput[]; invalidLines: string[] } {
  const items: HolidayInput[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const separatorIndex = line.search(/[,\t]|\s{2,}/);
    const datePart = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim();
    const namePart = (separatorIndex === -1 ? '' : line.slice(separatorIndex + 1)).trim();
    const date = normalizeHolidayDate(datePart);

    if (!date || !namePart) {
      invalidLines.push(rawLine);
      continue;
    }

    const key = `${date}|${namePart}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({ date, name: namePart });
  }

  return { items, invalidLines };
}

function normalizeHolidayDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseIsoDate(value) ? value : null;
  }

  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return parseIsoDate(iso) ? iso : null;
  }

  return null;
}
