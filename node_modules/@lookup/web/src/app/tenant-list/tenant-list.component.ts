import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { parseApiError } from '../core/api-error';
import { LookupApiService } from '../core/lookup-api.service';
import type { Tenant } from '../core/models';
import { CreateTenantDialogComponent } from '../dialogs/create-tenant-dialog.component';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './tenant-list.component.html',
  styleUrl: './tenant-list.component.scss',
})
export class TenantListComponent implements OnInit {
  private readonly api = inject(LookupApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  displayedColumns = ['name', 'slug', 'actions'] as const;
  tenants: Tenant[] = [];
  loading = true;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.listTenants(1, 100).subscribe({
      next: (p) => {
        this.tenants = p.items;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
      },
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(CreateTenantDialogComponent, { width: '400px' });
    ref.afterClosed().subscribe((created: Tenant | undefined) => {
      if (created) {
        this.snack.open(`Tenant “${created.name}” created`, 'OK', { duration: 3000 });
        this.load();
      }
    });
  }

  confirmDelete(row: Tenant): void {
    if (
      !window.confirm(
        `Delete tenant “${row.name}”? This soft-deletes the tenant; it will no longer appear in the list.`
      )
    ) {
      return;
    }
    this.api.deleteTenant(row.id).subscribe({
      next: () => {
        this.snack.open('Tenant deleted', 'OK', { duration: 3000 });
        this.load();
      },
      error: (e) => this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 }),
    });
  }
}
