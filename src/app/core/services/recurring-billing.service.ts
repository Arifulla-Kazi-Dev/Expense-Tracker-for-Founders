import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collection, doc, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import type { DocumentData, UpdateData } from '@angular/fire/firestore';
import { firstValueFrom, map } from 'rxjs';

import { BillingCycle, RecurringCost } from '../models/recurring-cost.model';
import { computeDueDates, toIsoDate } from '../utils/date-cycles';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';
import { RecurringCostService } from './recurring-cost.service';

export { toIsoDate };

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
  const result = computeDueDates(nextBillingDate, billingCycle, today, MAX_CATCH_UP_CYCLES);
  return { dueDates: result.dueDates, nextBillingDate: result.nextDate };
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

      // Deterministic per-cycle IDs make billing idempotent: re-running catch-up
      // (or nextBillingDate getting edited back over an already-billed cycle,
      // e.g. correcting a start date) can never create a second charge for the
      // same cycle — all reads happen before writes, per Firestore transaction rules.
      const candidates = dueDates.map((billedDate) => ({
        billedDate,
        ref: doc(chargesCollection, `${recurringCostId}_${billedDate}`),
      }));
      const existingSnapshots = await Promise.all(candidates.map(({ ref }) => transaction.get(ref)));

      candidates.forEach(({ billedDate, ref }, index) => {
        if (existingSnapshots[index].exists()) {
          return;
        }

        transaction.set(ref, sanitize({
          id: ref.id,
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
