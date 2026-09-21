import { Injectable, inject } from '@angular/core';

import { LeaveRequest, LeaveRequestInput } from '../models/leave-request.model';
import { FirestoreCrudService } from './firestore-crud.service';

interface LeaveRequestCreatePayload extends LeaveRequestInput {
  memberName: string;
  status: 'Pending';
}

interface LeaveReviewPayload {
  status: 'Approved' | 'Rejected';
  reviewedBy: string;
  reviewedByName: string;
}

@Injectable({ providedIn: 'root' })
export class LeaveRequestService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'leaveRequests';

  list() {
    return this.crud.list<LeaveRequest>(this.collectionName);
  }

  create(input: LeaveRequestInput, memberName: string) {
    const payload: LeaveRequestCreatePayload = { ...input, memberName, status: 'Pending' };
    return this.crud.create(this.collectionName, payload);
  }

  review(id: string, status: 'Approved' | 'Rejected', reviewerUid: string, reviewerName: string) {
    const payload: LeaveReviewPayload = { status, reviewedBy: reviewerUid, reviewedByName: reviewerName };
    return this.crud.update<LeaveReviewPayload>(this.collectionName, id, payload);
  }

  withdraw(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
