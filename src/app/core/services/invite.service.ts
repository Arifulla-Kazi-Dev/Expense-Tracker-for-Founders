import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionSnapshots,
  doc,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, catchError, firstValueFrom, map, of, shareReplay, switchMap, take, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CompanyInvite, CreateInviteInput } from '../models/company.model';
import { INVITABLE_ROLES, roleDisplayName } from '../models/role.model';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';

@Injectable({ providedIn: 'root' })
export class InviteService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly lookupSyncTokens = new Set<string>();

  readonly invites$: Observable<CompanyInvite[]> = this.companyService.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId) {
        return of([]);
      }

      const invitesRef = collection(this.firestore, `companies/${companyId}/invites`);
      return collectionSnapshots(query(invitesRef, orderBy('createdAt', 'desc'))).pipe(
        map((snapshots) => snapshots.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as CompanyInvite)),
        tap((invites) => void this.ensureInviteLookups(invites)),
        catchError((error) => {
          console.error('Invites load failed', error);
          return of([]);
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async createInvite(input: CreateInviteInput): Promise<CompanyInvite> {
    if (!INVITABLE_ROLES.includes(input.role)) {
      throw new Error('Founder role cannot be assigned through an invite link.');
    }

    const user = this.authService.currentUser;
    const profile = await firstValueFrom(this.authService.profile$.pipe(take(1)));
    const company = await firstValueFrom(this.companyService.activeCompany$.pipe(take(1)));
    const companyId = this.companyService.requireActiveCompanyId();

    if (!user || !profile || !company) {
      throw new Error('You need an active company workspace before generating invites.');
    }

    const token = createInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Math.max(Number(input.expiryDays) || 7, 1));

    const invite: CompanyInvite = {
      inviteId: token,
      companyId,
      companyName: company.companyName,
      token,
      role: input.role,
      invitedEmail: cleanOptional(input.invitedEmail),
      invitedPhone: cleanOptional(input.invitedPhone),
      invitedByUid: user.uid,
      invitedByName: profile.name,
      status: 'pending',
      expiresAt,
      createdAt: null,
    };

    const createdAt = serverTimestamp();
    const batch = writeBatch(this.firestore);

    batch.set(doc(this.firestore, `companies/${companyId}/invites/${token}`), {
      ...withoutUndefined(invite as unknown as Record<string, unknown>),
      createdAt,
    });
    batch.set(doc(this.firestore, `inviteLookups/${token}`), publicInvitePayload(invite, createdAt));

    await batch.commit();

    return invite;
  }

  async validateInviteToken(token: string): Promise<CompanyInvite | null> {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const snapshot = await getDoc(doc(this.firestore, `inviteLookups/${normalizedToken}`));
    const invite = snapshot.exists()
      ? ({ ...snapshot.data(), id: snapshot.id } as CompanyInvite)
      : null;

    if (!invite) {
      return null;
    }

    return {
      ...invite,
      status: this.resolveInviteStatus(invite),
    };
  }

  async revokeInvite(invite: CompanyInvite): Promise<void> {
    const update = {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    };
    const batch = writeBatch(this.firestore);

    batch.update(doc(this.firestore, `companies/${invite.companyId}/invites/${invite.inviteId}`), update);
    batch.update(doc(this.firestore, `inviteLookups/${invite.token}`), update);

    await batch.commit();
  }

  inviteLink(token: string): string {
    const baseHref = normalizeBaseUrl(environment.publicAppUrl)
      ?? (this.isBrowser ? this.document.querySelector('base')?.href : null)
      ?? (this.isBrowser ? `${window.location.origin}/` : '/');
    return new URL(`register?inviteToken=${encodeURIComponent(token)}`, baseHref).toString();
  }

  whatsAppShareUrl(invite: CompanyInvite): string {
    const message = `Hi, you have been invited to join ${invite.companyName} on Expense Tracker for Founders as ${roleDisplayName(invite.role)}. Use this link to sign up: ${this.inviteLink(invite.token)}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  private resolveInviteStatus(invite: CompanyInvite): CompanyInvite['status'] {
    if (invite.status !== 'pending') {
      return invite.status;
    }

    return isExpired(invite.expiresAt) ? 'expired' : 'pending';
  }

  private async ensureInviteLookups(invites: CompanyInvite[]): Promise<void> {
    const pendingInvites = invites.filter((invite) => invite.status === 'pending' && invite.token);

    for (const invite of pendingInvites) {
      if (this.lookupSyncTokens.has(invite.token)) {
        continue;
      }

      this.lookupSyncTokens.add(invite.token);

      await setDoc(
        doc(this.firestore, `inviteLookups/${invite.token}`),
        publicInvitePayload(invite, invite.createdAt ?? serverTimestamp()),
        { merge: true },
      ).catch((error) => {
        this.lookupSyncTokens.delete(invite.token);
        console.error('Invite lookup sync failed', error);
      });
    }
  }
}

function createInviteToken(): string {
  const bytes = new Uint8Array(24);
  const crypto = globalThis.crypto;

  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
}

function publicInvitePayload(invite: CompanyInvite, createdAt: unknown): Record<string, unknown> {
  return withoutUndefined({
    inviteId: invite.inviteId,
    companyId: invite.companyId,
    companyName: invite.companyName,
    token: invite.token,
    role: invite.role,
    invitedByUid: invite.invitedByUid,
    invitedByName: invite.invitedByName,
    status: invite.status,
    expiresAt: invite.expiresAt,
    createdAt,
    acceptedAt: invite.acceptedAt,
    acceptedByUid: invite.acceptedByUid,
  });
}

function isExpired(value: unknown): boolean {
  const expiresAt = value instanceof Timestamp
    ? value.toDate()
    : value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;

  return expiresAt ? expiresAt.getTime() <= Date.now() : false;
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}
