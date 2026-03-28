import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { LookupApiService } from './lookup-api.service';

describe('LookupApiService', () => {
  let service: LookupApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), LookupApiService],
    });
    service = TestBed.inject(LookupApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('listTenants GETs /tenants with pagination', () => {
    service.listTenants(1, 20).subscribe((res) => {
      expect(res.items.length).toBe(1);
      expect(res.meta.totalItems).toBe(1);
    });
    const req = http.expectOne(
      (r) => r.url === `${environment.apiPrefix}/tenants` && r.params.get('page') === '1'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [{ id: 'a', slug: 't', name: 'T', createdAt: '', updatedAt: '' }],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  });
});
