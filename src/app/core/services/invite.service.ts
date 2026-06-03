import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  collectionGroup,
  collectionSnapshots,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, catchError, firstValueFrom, map, of, shareReplay, switchMap, take } from 'rxjs';

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

  readonly invites$: Observable<CompanyInvite[]> = this.companyService.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId) {
        return of([]);
      }

      const invitesRef = collection(this.firestore, `companies/${companyId}/invites`);
      return collectionSnapshots(query(invitesRef, orderBy('createdAt', 'desc'))).pipe(
        map((snapshots) => snapshots.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as CompanyInvite)),
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

    await setDoc(doc(this.firestore, `companies/${companyId}/invites/${token}`), {
      ...withoutUndefined(invite as unknown as Record<string, unknown>),
      createdAt: serverTimestamp(),
    });

    return invite;
  }

  async validateInviteToken(token: string): Promise<CompanyInvite | null> {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const inviteQuery = query(collectionGroup(this.firestore, 'invites'), where('token', '==', normalizedToken));
    const snapshots = await getDocs(inviteQuery);
    const invite = snapshots.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as CompanyInvite)[0] ?? null;

    if (!invite) {
      return null;
    }

    return {
      ...invite,
      status: this.resolveInviteStatus(invite),
    };
  }

  async revokeInvite(invite: CompanyInvite): Promise<void> {
    await updateDoc(doc(this.firestore, `companies/${invite.companyId}/invites/${invite.inviteId}`), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  }

  inviteLink(token: string): string {
    if (!this.isBrowser) {
      return `/register?inviteToken=${encodeURIComponent(token)}`;
    }

    const baseHref = this.document.querySelector('base')?.href ?? `${window.location.origin}/`;
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
