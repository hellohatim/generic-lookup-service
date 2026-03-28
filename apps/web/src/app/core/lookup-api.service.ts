import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  EntryRow,
  LookupTable,
  Namespace,
  Paged,
  TableVersion,
  Tenant,
} from './models';

export type ExportFormat = 'wide' | 'kv' | 'flat_object';

@Injectable({ providedIn: 'root' })
export class LookupApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiPrefix;

  listTenants(page = 1, pageSize = 50, q?: string): Observable<Paged<Tenant>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    if (q?.trim()) {
      params = params.set('q', q.trim());
    }
    return this.http.get<Paged<Tenant>>(`${this.base}/tenants`, { params });
  }

  createTenant(body: { name: string; slug: string }): Observable<Tenant> {
    return this.http.post<Tenant>(`${this.base}/tenants`, body);
  }

  deleteTenant(tenantId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tenants/${tenantId}`);
  }

  listNamespaces(
    tenantId: string,
    page = 1,
    pageSize = 50
  ): Observable<Paged<Namespace>> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<Paged<Namespace>>(
      `${this.base}/tenants/${tenantId}/namespaces`,
      { params }
    );
  }

  createNamespace(
    tenantId: string,
    body: { name: string; slug: string; description?: string }
  ): Observable<Namespace> {
    return this.http.post<Namespace>(
      `${this.base}/tenants/${tenantId}/namespaces`,
      body
    );
  }

  deleteNamespace(
    tenantId: string,
    namespaceId: string,
    opts?: { permanent?: boolean }
  ): Observable<void> {
    let params = new HttpParams();
    if (opts?.permanent) {
      params = params.set('permanent', 'true');
    }
    return this.http.delete<void>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}`,
      { params }
    );
  }

  listTables(
    tenantId: string,
    namespaceId: string,
    page = 1,
    pageSize = 50
  ): Observable<Paged<LookupTable>> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<Paged<LookupTable>>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables`,
      { params }
    );
  }

  createTable(
    tenantId: string,
    namespaceId: string,
    body: { name: string; slug: string; description?: string }
  ): Observable<LookupTable> {
    return this.http.post<LookupTable>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables`,
      body
    );
  }

  getTable(
    tenantId: string,
    namespaceId: string,
    tableId: string
  ): Observable<LookupTable> {
    return this.http.get<LookupTable>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}`
    );
  }

  listVersions(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    page = 1,
    pageSize = 50
  ): Observable<Paged<TableVersion>> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<Paged<TableVersion>>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/versions`,
      { params }
    );
  }

  listEntries(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    opts: {
      page?: number;
      pageSize?: number;
      key?: string;
      value?: string;
      valueMatch?: 'exact' | 'partial';
      valuePath?: string;
      versionId?: string;
      caseSensitive?: boolean;
    }
  ): Observable<Paged<EntryRow>> {
    let params = new HttpParams();
    if (opts.page != null) {
      params = params.set('page', String(opts.page));
    }
    if (opts.pageSize != null) {
      params = params.set('pageSize', String(opts.pageSize));
    }
    if (opts.key?.trim()) {
      params = params.set('key', opts.key.trim());
    }
    if (opts.value?.trim()) {
      params = params.set('value', opts.value.trim());
    }
    if (opts.valueMatch) {
      params = params.set('valueMatch', opts.valueMatch);
    }
    if (opts.valuePath?.trim()) {
      params = params.set('valuePath', opts.valuePath.trim());
    }
    if (opts.versionId) {
      params = params.set('versionId', opts.versionId);
    }
    if (opts.caseSensitive === true) {
      params = params.set('caseSensitive', 'true');
    }
    return this.http.get<Paged<EntryRow>>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`,
      { params }
    );
  }

  createEntry(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    body: { key: string; value: unknown }
  ): Observable<EntryRow> {
    return this.http.post<EntryRow>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`,
      body
    );
  }

  patchEntry(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    entryId: string,
    body: { key?: string; value?: unknown }
  ): Observable<EntryRow> {
    return this.http.patch<EntryRow>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries/${entryId}`,
      body
    );
  }

  deleteEntry(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    entryId: string
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries/${entryId}`
    );
  }

  exportWorkbook(
    tenantId: string,
    namespaceId: string,
    tableId: string,
    format: ExportFormat,
    versionId?: string
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format).set('filename', 'lookup-export');
    if (versionId) {
      params = params.set('versionId', versionId);
    }
    return this.http.get(
      `${this.base}/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/exports`,
      { params, responseType: 'blob' }
    );
  }
}
