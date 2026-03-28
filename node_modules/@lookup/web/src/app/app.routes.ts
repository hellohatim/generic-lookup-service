import { Routes } from '@angular/router';
import { NamespaceListComponent } from './namespace-list/namespace-list.component';
import { TableEntriesComponent } from './table-entries/table-entries.component';
import { TableListComponent } from './table-list/table-list.component';
import { TenantListComponent } from './tenant-list/tenant-list.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tenants' },
  { path: 'tenants', component: TenantListComponent },
  { path: 'tenants/:tenantId/namespaces', component: NamespaceListComponent },
  {
    path: 'tenants/:tenantId/namespaces/:namespaceId/tables',
    component: TableListComponent,
  },
  {
    path: 'tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries',
    component: TableEntriesComponent,
  },
  { path: '**', redirectTo: 'tenants' },
];
