import { Component, Inject, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { parseApiError } from '../core/api-error';
import { LookupApiService } from '../core/lookup-api.service';
import type { Namespace } from '../core/models';

export type CreateNsData = { tenantId: string };

@Component({
  selector: 'app-create-namespace-dialog',
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
    <h2 mat-dialog-title>Create namespace</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" name="name" required />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Slug</mat-label>
        <input matInput [(ngModel)]="slug" name="slug" required />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="saving || !name.trim() || !slug.trim()">
        Create
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
        min-width: 320px;
      }
    `,
  ],
})
export class CreateNamespaceDialogComponent {
  private readonly api = inject(LookupApiService);
  private readonly ref = inject(MatDialogRef<CreateNamespaceDialogComponent, Namespace | undefined>);
  private readonly snack = inject(MatSnackBar);

  name = '';
  slug = '';
  saving = false;

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: CreateNsData) {}

  save(): void {
    this.saving = true;
    this.api
      .createNamespace(this.data.tenantId, { name: this.name.trim(), slug: this.slug.trim() })
      .subscribe({
        next: (n) => this.ref.close(n),
        error: (e) => {
          this.saving = false;
          this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
        },
      });
  }
}
