import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { parseApiError } from '../core/api-error';
import { LookupApiService } from '../core/lookup-api.service';
import type { Tenant } from '../core/models';

@Component({
  selector: 'app-create-tenant-dialog',
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
    <h2 mat-dialog-title>Create tenant</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Name</mat-label>
        <input matInput [(ngModel)]="name" name="name" required />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Slug</mat-label>
        <input matInput [(ngModel)]="slug" name="slug" required />
        <mat-hint>Lowercase letters, numbers, hyphens (see OpenAPI pattern)</mat-hint>
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
        gap: 0.5rem;
        min-width: 320px;
      }
    `,
  ],
})
export class CreateTenantDialogComponent {
  private readonly api = inject(LookupApiService);
  private readonly ref = inject(MatDialogRef<CreateTenantDialogComponent, Tenant | undefined>);
  private readonly snack = inject(MatSnackBar);

  name = '';
  slug = '';
  saving = false;

  save(): void {
    this.saving = true;
    this.api.createTenant({ name: this.name.trim(), slug: this.slug.trim() }).subscribe({
      next: (t) => this.ref.close(t),
      error: (e) => {
        this.saving = false;
        this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
      },
    });
  }
}
