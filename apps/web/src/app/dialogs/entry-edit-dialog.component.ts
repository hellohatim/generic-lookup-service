import { Component, Inject, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { parseApiError } from '../core/api-error';
import { LookupApiService } from '../core/lookup-api.service';
import type { EntryRow } from '../core/models';

export type EntryEditData = {
  tenantId: string;
  namespaceId: string;
  tableId: string;
  entry?: EntryRow;
};

@Component({
  selector: 'app-entry-edit-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.entry ? 'Edit entry' : 'Add entry' }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Key</mat-label>
        <input matInput [(ngModel)]="key" name="key" [disabled]="!!data.entry" required />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Value (JSON)</mat-label>
        <textarea matInput rows="8" [(ngModel)]="valueJson" name="valueJson"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving || !key.trim()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full {
        width: 100%;
      }
      mat-dialog-content {
        display: flex;
        flex-direction: column;
        min-width: 400px;
      }
    `,
  ],
})
export class EntryEditDialogComponent implements OnInit {
  private readonly api = inject(LookupApiService);
  private readonly ref = inject(MatDialogRef<EntryEditDialogComponent, EntryRow | undefined>);
  private readonly snack = inject(MatSnackBar);

  key = '';
  valueJson = 'null';
  saving = false;

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: EntryEditData) {}

  ngOnInit(): void {
    if (this.data.entry) {
      this.key = this.data.entry.key;
      this.valueJson = JSON.stringify(this.data.entry.value, null, 2);
    }
  }

  save(): void {
    let value: unknown;
    try {
      value = JSON.parse(this.valueJson || 'null');
    } catch {
      this.snack.open('Invalid JSON in value field', 'Dismiss', { duration: 4000 });
      return;
    }
    this.saving = true;
    const { tenantId, namespaceId, tableId, entry } = this.data;
    if (entry) {
      this.api.patchEntry(tenantId, namespaceId, tableId, entry.id, { value }).subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.saving = false;
          this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
        },
      });
    } else {
      this.api.createEntry(tenantId, namespaceId, tableId, { key: this.key.trim(), value }).subscribe({
        next: (r) => this.ref.close(r),
        error: (e) => {
          this.saving = false;
          this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
        },
      });
    }
  }
}
