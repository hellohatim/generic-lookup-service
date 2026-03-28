import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { parseApiError } from '../core/api-error';
import { LookupApiService } from '../core/lookup-api.service';
import type { Namespace } from '../core/models';
import {
  CreateNamespaceDialogComponent,
  type CreateNsData,
} from '../dialogs/create-namespace-dialog.component';

@Component({
  selector: 'app-namespace-list',
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
  ],
  templateUrl: './namespace-list.component.html',
  styleUrl: './namespace-list.component.scss',
})
export class NamespaceListComponent implements OnInit {
  private readonly api = inject(LookupApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  tenantId = '';
  displayedColumns = ['name', 'slug', 'actions'] as const;
  namespaces: Namespace[] = [];
  loading = true;

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.listNamespaces(this.tenantId, 1, 100).subscribe({
      next: (p) => {
        this.namespaces = p.items;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
      },
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(CreateNamespaceDialogComponent, {
      width: '400px',
      data: { tenantId: this.tenantId } satisfies CreateNsData,
    });
    ref.afterClosed().subscribe((n) => {
      if (n) {
        this.snack.open(`Namespace “${n.name}” created`, 'OK', { duration: 3000 });
        this.load();
      }
    });
  }

  confirmDelete(row: Namespace): void {
    if (
      !window.confirm(
        `Delete namespace “${row.name}”? This soft-deletes the namespace; it will no longer appear in the list.`
      )
    ) {
      return;
    }
    this.api.deleteNamespace(this.tenantId, row.id).subscribe({
      next: () => {
        this.snack.open('Namespace deleted', 'OK', { duration: 3000 });
        this.load();
      },
      error: (e) => this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 }),
    });
  }
}
