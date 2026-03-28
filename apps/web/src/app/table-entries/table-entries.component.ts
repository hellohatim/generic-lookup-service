import { SlicePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MatPaginator,
  MatPaginatorModule,
  PageEvent,
} from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { parseApiError } from '../core/api-error';
import {
  LookupApiService,
  type ExportFormat,
} from '../core/lookup-api.service';
import type { EntryRow, LookupTable, TableVersion } from '../core/models';
import {
  EntryEditDialogComponent,
  type EntryEditData,
} from '../dialogs/entry-edit-dialog.component';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'app-table-entries',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    SlicePipe,
    MatToolbarModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './table-entries.component.html',
  styleUrl: './table-entries.component.scss',
})
export class TableEntriesComponent implements OnInit {
  private readonly api = inject(LookupApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  /** Debounced reload when the Value field changes (live “contains” search). */
  private readonly valueTyping$ = new Subject<void>();

  @ViewChild(MatPaginator) paginator?: MatPaginator;

  tenantId = '';
  namespaceId = '';
  tableId = '';

  table: LookupTable | null = null;
  versions: TableVersion[] = [];
  selectedVersionId = '';
  entries: EntryRow[] = [];
  totalItems = 0;
  pageSize = 20;
  pageIndex = 0;
  loading = true;
  loadingEntries = false;

  filterKey = '';
  filterValue = '';
  filterValueMatch: 'exact' | 'partial' | '' = '';
  filterValuePath = '';
  exportFormat: ExportFormat = 'flat_object';

  /** Key/value columns vs flattened object fields as columns (current page). */
  entriesView: 'kv' | 'tabular' = 'kv';

  /** Stable column ids for tabular mat-table; recomputed when `entries` loads. */
  tabularColumnIds: string[] = [];

  displayedColumns = ['key', 'value', 'updatedAt', 'actions'] as const;

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('tenantId') ?? '';
    this.namespaceId = this.route.snapshot.paramMap.get('namespaceId') ?? '';
    this.tableId = this.route.snapshot.paramMap.get('tableId') ?? '';
    this.valueTyping$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex = 0;
        this.paginator?.firstPage();
        this.loadEntries();
      });
    this.loadTableAndVersions();
  }

  get readOnly(): boolean {
    if (!this.table) {
      return true;
    }
    if (this.table.isExpired) {
      return true;
    }
    if (this.selectedVersionId && this.selectedVersionId !== this.table.currentVersionId) {
      return true;
    }
    return false;
  }

  loadTableAndVersions(): void {
    this.loading = true;
    this.api.getTable(this.tenantId, this.namespaceId, this.tableId).subscribe({
      next: (t) => {
        this.table = t;
        this.selectedVersionId = t.currentVersionId;
        this.api
          .listVersions(this.tenantId, this.namespaceId, this.tableId, 1, 100)
          .subscribe({
            next: (pv) => {
              this.versions = pv.items;
              this.loading = false;
              this.loadEntries();
            },
            error: (e) => {
              this.loading = false;
              this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
            },
          });
      },
      error: (e) => {
        this.loading = false;
        this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
      },
    });
  }

  onVersionChange(): void {
    this.pageIndex = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.loadEntries();
  }

  applyFilters(): void {
    if (this.filterValuePath.trim() && !this.filterValue.trim()) {
      this.snack.open('Value is required when value path is set', 'OK', { duration: 4000 });
      return;
    }
    this.pageIndex = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.loadEntries();
  }

  /** Fires debounced grid reload while typing in Value (partial match when “Value match” is unset). */
  onValueFilterTyping(): void {
    this.valueTyping$.next();
  }

  /** When Value match changes and Value is non-empty, refresh immediately. */
  onValueMatchChange(): void {
    if (!this.filterValue.trim()) {
      return;
    }
    this.pageIndex = 0;
    this.paginator?.firstPage();
    this.loadEntries();
  }

  /** When Value is non-empty, path edits use the same debounced reload as typing in Value. */
  onValuePathChange(): void {
    if (!this.filterValue.trim()) {
      return;
    }
    this.valueTyping$.next();
  }

  onPage(ev: PageEvent): void {
    this.pageIndex = ev.pageIndex;
    this.pageSize = ev.pageSize;
    this.loadEntries();
  }

  /**
   * API requires a non-empty `value` whenever `valuePath` is sent.
   * If “Value match” is unset but the user typed a value, default to partial (substring) for live search.
   */
  private valueFilterParams(): {
    value?: string;
    valueMatch?: 'exact' | 'partial';
    valuePath?: string;
  } {
    const pathTrim = this.filterValuePath.trim();
    const valTrim = this.filterValue.trim();
    const canUsePath = Boolean(pathTrim && valTrim);
    const valueMatch: 'exact' | 'partial' | undefined =
      valTrim && !this.filterValueMatch ? 'partial' : this.filterValueMatch || undefined;
    return {
      value: valTrim || undefined,
      valueMatch: valTrim ? valueMatch : undefined,
      valuePath: canUsePath ? pathTrim : undefined,
    };
  }

  loadEntries(): void {
    this.loadingEntries = true;
    const versionId =
      this.selectedVersionId === this.table?.currentVersionId
        ? undefined
        : this.selectedVersionId;
    const vf = this.valueFilterParams();
    this.api
      .listEntries(this.tenantId, this.namespaceId, this.tableId, {
        page: this.pageIndex + 1,
        pageSize: this.pageSize,
        key: this.filterKey.trim() || undefined,
        ...vf,
        versionId,
      })
      .subscribe({
        next: (p) => {
          this.entries = p.items;
          this.totalItems = p.meta.totalItems;
          this.tabularColumnIds = this.computeTabularColumnIds(p.items);
          this.loadingEntries = false;
        },
        error: (e) => {
          this.loadingEntries = false;
          this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 });
        },
      });
  }

  valuePreview(v: unknown): string {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }

  private isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  private computeTabularColumnIds(items: EntryRow[]): string[] {
    const fieldKeys = new Set<string>();
    let hasNonObject = false;
    for (const e of items) {
      if (this.isPlainObject(e.value)) {
        for (const k of Object.keys(e.value)) {
          fieldKeys.add(k);
        }
      } else {
        hasNonObject = true;
      }
    }
    const sorted = Array.from(fieldKeys).sort((a, b) => a.localeCompare(b));
    const cols: string[] = ['key'];
    if (sorted.length === 0) {
      cols.push('__scalar');
    } else {
      cols.push(...sorted);
      if (hasNonObject) {
        cols.push('__scalar');
      }
    }
    cols.push('updatedAt', 'actions');
    return cols;
  }

  tabularHeader(col: string): string {
    if (col === 'key') {
      return 'Key';
    }
    if (col === 'updatedAt') {
      return 'Updated';
    }
    if (col === 'actions') {
      return '';
    }
    if (col === '__scalar') {
      return 'Value';
    }
    return col;
  }

  tabularCellText(row: EntryRow, col: string): string {
    if (col === 'key') {
      return row.key;
    }
    if (col === '__scalar') {
      return this.isPlainObject(row.value) ? '' : this.valuePreview(row.value);
    }
    if (this.isPlainObject(row.value) && Object.prototype.hasOwnProperty.call(row.value, col)) {
      return this.formatTabularField((row.value as Record<string, unknown>)[col]);
    }
    return '';
  }

  private formatTabularField(x: unknown): string {
    if (x === undefined) {
      return '';
    }
    if (x === null) {
      return '—';
    }
    if (typeof x === 'object') {
      const s = JSON.stringify(x);
      return s.length > 100 ? `${s.slice(0, 97)}…` : s;
    }
    return String(x);
  }

  openCreate(): void {
    const ref = this.dialog.open(EntryEditDialogComponent, {
      width: '480px',
      data: {
        tenantId: this.tenantId,
        namespaceId: this.namespaceId,
        tableId: this.tableId,
      } satisfies EntryEditData,
    });
    ref.afterClosed().subscribe((row) => {
      if (row) {
        this.snack.open('Entry created', 'OK', { duration: 3000 });
        this.loadEntries();
      }
    });
  }

  openEdit(row: EntryRow): void {
    const ref = this.dialog.open(EntryEditDialogComponent, {
      width: '480px',
      data: {
        tenantId: this.tenantId,
        namespaceId: this.namespaceId,
        tableId: this.tableId,
        entry: row,
      } satisfies EntryEditData,
    });
    ref.afterClosed().subscribe((updated) => {
      if (updated) {
        this.snack.open('Entry updated', 'OK', { duration: 3000 });
        this.loadEntries();
      }
    });
  }

  confirmDelete(row: EntryRow): void {
    if (!window.confirm(`Delete entry “${row.key}”?`)) {
      return;
    }
    this.api
      .deleteEntry(this.tenantId, this.namespaceId, this.tableId, row.id)
      .subscribe({
        next: () => {
          this.snack.open('Deleted', 'OK', { duration: 2000 });
          this.loadEntries();
        },
        error: (e) => this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 }),
      });
  }

  export(): void {
    const versionId =
      this.selectedVersionId === this.table?.currentVersionId
        ? undefined
        : this.selectedVersionId;
    this.api
      .exportWorkbook(
        this.tenantId,
        this.namespaceId,
        this.tableId,
        this.exportFormat,
        versionId
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export-${this.tableId.slice(-8)}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (e) => this.snack.open(parseApiError(e), 'Dismiss', { duration: 6000 }),
      });
  }
}
