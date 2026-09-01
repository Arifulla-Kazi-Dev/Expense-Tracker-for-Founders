import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collection, doc, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import type { DocumentData, UpdateData } from '@angular/fire/firestore';
import { firstValueFrom, map } from 'rxjs';

import { BillingCycle, RecurringCost } from '../models/recurring-cost.model';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';
import { RecurringCostService } from './recurring-cost.service';

export const MAX_CATCH_UP_CYCLES = 60;

export interface DueCyclesResult {
  dueDates: string[];
  nextBillingDate: string;
}

/**
 * Pure catch-up math: given a recurring cost's stored `nextBillingDate` and how
 * far behind it can be, returns every cycle that's now due (dated to when each
 * cycle was actually due, not "today") plus where `nextBillingDate` should land
 * afterward. Capped so a stale or bad date can't generate unbounded charges.
 */
export function computeDueCycles(nextBillingDate: string, billingCycle: BillingCycle, today: string): DueCyclesResult {
  const dueDates: string[] = [];
  let cursor = nextBillingDate;
  let iterations = 0;

  while (cursor && cursor <= today && iterations < MAX_CATCH_UP_CYCLES) {
    dueDates.push(cursor);
    cursor = advanceBillingDate(cursor, billingCycle);
    iterations += 1;
  }

  return { dueDates, nextBillingDate: cursor };
}

@Injectable({ providedIn: 'root' })
export class RecurringBillingService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly recurringCostService = inject(RecurringCostService);
  private readonly environmentInjector = inject(EnvironmentInjector);

  async runCatchUpBilling(): Promise<void> {
    return runInInjectionContext(this.environmentInjector, () => this.runCatchUpBillingInternal());
  }

  private async runCatchUpBillingInternal(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    const companyId = this.permissionService.activeCompanyId;

    if (!uid || !companyId || !this.permissionService.can('manageRecurringCosts')) {
      return;
    }

    const today = toIsoDate(new Date());
    let dueItems: RecurringCost[];

    try {
      dueItems = await firstValueFrom(
        this.recurringCostService.list().pipe(
          map((items) => items.filter((item) => item.isActive && item.nextBillingDate && item.nextBillingDate <= today)),
        ),
      );
    } catch (error) {
      console.error('Recurring billing lookup failed', error);
      return;
    }

    for (const item of dueItems) {
      try {
        await this.billOne(companyId, uid, item.id, today);
      } catch (error) {
        console.error(`Recurring billing failed for recurring cost ${item.id}`, error);
      }
    }
  }

  private async billOne(companyId: string, uid: string, recurringCostId: string, today: string): Promise<void> {
    const costRef = doc(this.firestore, `companies/${companyId}/recurringCosts/${recurringCostId}`);
    const chargesCollection = collection(this.firestore, `companies/${companyId}/recurringCostCharges`);

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(costRef);

      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data() as RecurringCost;

      if (!data.isActive || !data.nextBillingDate) {
        return;
      }

      const { dueDates, nextBillingDate: cursor } = computeDueCycles(data.nextBillingDate, data.billingCycle, today);

      if (!dueDates.length) {
        return;
      }

      dueDates.forEach((billedDate) => {
        const chargeRef = doc(chargesCollection);
        transaction.set(chargeRef, sanitize({
          id: chargeRef.id,
          uid,
          companyId,
          recurringCostId,
          name: data.name,
          category: data.category,
          amount: data.amount,
          billingCycle: data.billingCycle,
          billedDate,
          fundingSourceId: data.fundingSourceId,
          fundingSourceName: data.fundingSourceName,
          fundingSourceType: data.fundingSourceType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }));
      });

      transaction.update(costRef, sanitize({
        nextBillingDate: cursor,
        lastBilledDate: dueDates[dueDates.length - 1],
        updatedAt: serverTimestamp(),
      }) as UpdateData<DocumentData>);
    });
  }
}

function sanitize(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function advanceBillingDate(value: string, cycle: BillingCycle): string {
  const date = parseIsoDate(value) ?? new Date();

  if (cycle === 'Quarterly') {
    date.setMonth(date.getMonth() + 3);
  } else if (cycle === 'Yearly') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return toIsoDate(date);
}
