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
import type { LookupTable } from '../core/models';
import {
  CreateTableDialogComponent,
  type CreateTableData,
} from '../dialogs/create-table-dialog.component';

@Component({
  selector: 'app-table-list',
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
  templateUrl: './table-list.component.html',
  styleUrl: './table-list.component.scss',
})
export class TableListComponent implements OnInit {
  private readonly api = inject(LookupApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  tenantId = '';
  namespaceId = '';
  displayedColumns = ['name', 'slug', 'badges', 'actions'] as const;
  tables: LookupTable[] = [];
  loading = true;

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.namespaceId = this.route.snapshot.paramMap.get('namespaceId') ?? '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.listTables(this.tenantId, this.namespaceId, 1, 100).subscribe({
      next: (p) => {
        this.tables = p.items;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
      },
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(CreateTableDialogComponent, {
      width: '400px',
      data: { tenantId: this.tenantId, namespaceId: this.namespaceId } satisfies CreateTableData,
    });
    ref.afterClosed().subscribe((t) => {
      if (t) {
        this.snack.open(`Table “${t.name}” created`, 'OK', { duration: 3000 });
        this.load();
      }
    });
  }
}
