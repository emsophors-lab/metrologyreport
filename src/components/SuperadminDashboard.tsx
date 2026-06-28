import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  Factory,
  FileCheck2,
  Hammer,
  MapPin,
  PieChart,
  Search,
  Send,
  ShieldCheck,
  Users,
  Wrench,
  XCircle
} from 'lucide-react';
import { MetrologyReport, MetrologyUser } from '../types';
import EnterpriseLicenseMapView from './EnterpriseLicenseMapView';
import TopServiceCompanies from './TopServiceCompanies';
import nmcLogo from '../NMClogo.png';

interface SuperadminDashboardProps {
  reports: MetrologyReport[];
  users: MetrologyUser[];
  activeCompanyList: MetrologyUser[];
}

const MONTHS = [
  { value: '01', kh: 'មករា' },
  { value: '02', kh: 'កុម្ភៈ' },
  { value: '03', kh: 'មីនា' },
  { value: '04', kh: 'មេសា' },
  { value: '05', kh: 'ឧសភា' },
  { value: '06', kh: 'មិថុនា' },
  { value: '07', kh: 'កក្កដា' },
  { value: '08', kh: 'សីហា' },
  { value: '09', kh: 'កញ្ញា' },
  { value: '10', kh: 'តុលា' },
  { value: '11', kh: 'វិច្ឆិកា' },
  { value: '12', kh: 'ធ្នូ' }
];

function getField(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

function hasGps(record: Record<string, any>) {
  return !!getField(record, ['business_latitude', 'latitude', 'lat', 'gps_latitude']) &&
    !!getField(record, ['business_longitude', 'longitude', 'lng', 'gps_longitude']);
}

function statusOf(record: Record<string, any>) {
  return String(getField(record, ['license_status', 'status', 'current_status']) || '').toLowerCase();
}

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
}

function reportMonthValue(report: MetrologyReport) {
  const raw = String(report.report_month || '').trim();
  const numeric = raw.match(/\d{1,2}/)?.[0];
  if (numeric) return numeric.padStart(2, '0');
  const idx = MONTHS.findIndex(m => raw.includes(m.kh));
  return idx >= 0 ? String(idx + 1).padStart(2, '0') : '';
}

function StatCard({
  icon,
  kh,
  en,
  value,
  helper,
  tone
}: {
  icon: React.ReactNode;
  kh: string;
  en: string;
  value: number;
  helper: string;
  tone: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';
}) {
  return (
    <div className={`superdash-stat superdash-stat--${tone}`}>
      <div className="superdash-stat__icon">{icon}</div>
      <div className="superdash-stat__body">
        <div>
          <p className="superdash-stat__kh">{kh}</p>
          <p className="superdash-stat__en">{en}</p>
        </div>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </div>
  );
}

export default function SuperadminDashboard({ reports, users, activeCompanyList }: SuperadminDashboardProps) {
  const [showAllReports, setShowAllReports] = useState(false);
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const companyRecords = activeCompanyList as Array<MetrologyUser & Record<string, any>>;
  const totalLicenses = companyRecords.length;
  const activeLicenses = companyRecords.filter(c => {
    const status = statusOf(c);
    return status ? ['active', 'renewed'].includes(status) : c.is_active !== false;
  }).length;
  const expiringSoon = companyRecords.filter(c => statusOf(c).includes('expiring')).length;
  const expired = companyRecords.filter(c => statusOf(c).includes('expired')).length;
  const telegramLinked = companyRecords.filter(c => !!getField(c, ['telegram_chat_id', 'telegram_username', 'telegram_connected_at'])).length;
  const noGps = companyRecords.filter(c => !hasGps(c)).length;
  const licensed = companyRecords.filter(c => String(c.license_number || '').trim()).length;
  const currentYear = String(new Date().getFullYear());
  const lastYear = String(new Date().getFullYear() - 1);

  const monthlySeries = MONTHS.map(month => {
    const thisYear = reports.filter(r => r.report_year === currentYear && reportMonthValue(r) === month.value).length;
    const previousYear = reports.filter(r => r.report_year === lastYear && reportMonthValue(r) === month.value).length;
    return { ...month, thisYear, previousYear };
  });
  const maxMonthly = Math.max(1, ...monthlySeries.flatMap(m => [m.thisYear, m.previousYear]));

  const sortedSubmittedReports = reports
      .slice()
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));

  const normalizedReportSearch = reportSearchQuery.trim().toLowerCase();
  const filteredSubmittedReports = normalizedReportSearch
    ? sortedSubmittedReports.filter(report => [
        report.customer_name,
        report.instrument_serial_number,
        report.measuring_instrument,
        report.company_name_kh,
        report.license_number,
        report.customer_address,
        report.scope_of_weight_measure
      ].some(value => String(value || '').toLowerCase().includes(normalizedReportSearch)))
    : sortedSubmittedReports;

  const manufactureCount = filteredSubmittedReports.filter(r => r.service_type === 'Manufacture').length;
  const installationCount = filteredSubmittedReports.filter(r => r.service_type === 'Installation').length;
  const repairCount = filteredSubmittedReports.filter(r => r.service_type === 'Repair').length;
  const filteredServiceTotal = manufactureCount + installationCount + repairCount;
  const serviceShares = [
    { key: 'manufacture', kh: 'ផលិត', en: 'Manufacture', count: manufactureCount, icon: <Factory />, tone: 'green' },
    { key: 'installation', kh: 'តម្លើង', en: 'Installation', count: installationCount, icon: <Wrench />, tone: 'blue' },
    { key: 'repair', kh: 'ជួសជុល', en: 'Repair', count: repairCount, icon: <Hammer />, tone: 'orange' }
  ];

  const recentActivities = sortedSubmittedReports
      .slice(0, 4)
      .map(report => ({
        key: `report-${report.id}`,
        icon: <FileCheck2 />,
        tone: 'blue',
        title: `${report.company_name_kh || 'Company'} បានដាក់របាយការណ៍ប្រចាំខែ`,
        subtitle: `${report.company_name_kh || 'Company'} submitted ${report.report_month || ''} ${report.report_year || ''} report`,
        time: String(report.updated_at || report.created_at || '').slice(0, 10)
      }));

  const mapRecords = companyRecords.map(company => ({
    ...company,
    company_name: company.company_name_en || company.company_name_kh,
    company_name_kh: company.company_name_kh,
    license_status: getField(company, ['license_status', 'status']) || (company.is_active === false ? 'Expired' : 'Active'),
    business_latitude: getField(company, ['business_latitude', 'latitude', 'lat', 'gps_latitude']),
    business_longitude: getField(company, ['business_longitude', 'longitude', 'lng', 'gps_longitude'])
  }));

  return (
    <div className="superdash">
      <section className="superdash-stats">
        <StatCard icon={<Building2 />} kh="អាជ្ញាប័ណ្ណសរុប" en="Total Licenses" value={totalLicenses} helper="សរុប / Total" tone="blue" />
        <StatCard icon={<ShieldCheck />} kh="កំពុងប្រើប្រាស់" en="Active" value={activeLicenses} helper={percent(activeLicenses, totalLicenses)} tone="green" />
        <StatCard icon={<Clock3 />} kh="ជិតផុតកំណត់" en="Expiring Soon" value={expiringSoon} helper={percent(expiringSoon, totalLicenses)} tone="orange" />
        <StatCard icon={<XCircle />} kh="ផុតកំណត់" en="Expired" value={expired} helper={percent(expired, totalLicenses)} tone="red" />
        <StatCard icon={<Send />} kh="ភ្ជាប់ Telegram" en="Telegram Linked" value={telegramLinked} helper={percent(telegramLinked, totalLicenses)} tone="purple" />
        <StatCard icon={<MapPin />} kh="គ្មានទីតាំង GPS" en="No GPS Location" value={noGps} helper={percent(noGps, totalLicenses)} tone="gray" />
      </section>

      <section className="superdash-main-grid">
        <div className="superdash-panel superdash-map-panel">
          <div className="superdash-panel__header">
            <h3>ផែនទីអាជ្ញាប័ណ្ណ / License Map</h3>
          </div>
          <EnterpriseLicenseMapView licenses={mapRecords} nmcLogoUrl={nmcLogo} className="superdash-map" />
          <div className="superdash-map-legend">
            <span><i className="is-active" /> សកម្ម / Active</span>
            <span><i className="is-expiring" /> ជិតផុតកំណត់ / Expiring</span>
            <span><i className="is-expired" /> ផុតកំណត់ / Expired</span>
          </div>
        </div>

        <div className="superdash-right">
          <div className="superdash-panel">
            <div className="superdash-panel__header">
              <h3>របាយការណ៍ប្រចាំខែ / Monthly Reports</h3>
              <div className="superdash-chart-legend">
                <span><i className="this-year" />ឆ្នាំនេះ / This Year</span>
                <span><i className="last-year" />ឆ្នាំមុន / Last Year</span>
              </div>
            </div>
            <div className="superdash-chart">
              {monthlySeries.map(month => (
                <div className="superdash-chart__month" key={month.value}>
                  <div className="superdash-chart__bars">
                    <span
                      className="this-year"
                      data-tooltip={`${month.kh} ${currentYear}: ${month.thisYear} reports`}
                      title={`${month.kh} ${currentYear}: ${month.thisYear} reports`}
                      style={{ height: `${Math.max(4, (month.thisYear / maxMonthly) * 128)}px` }}
                    />
                    <span
                      className="last-year"
                      data-tooltip={`${month.kh} ${lastYear}: ${month.previousYear} reports`}
                      title={`${month.kh} ${lastYear}: ${month.previousYear} reports`}
                      style={{ height: `${Math.max(4, (month.previousYear / maxMonthly) * 128)}px` }}
                    />
                  </div>
                  <small>{month.kh}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="superdash-panel superdash-activities">
            <div className="superdash-panel__header">
              <h3>សកម្មភាពថ្មីៗ / Recent Activities</h3>
              <button type="button" onClick={() => setShowAllReports((current) => !current)}>
                {showAllReports ? 'បិទបញ្ជី / Hide List' : 'មើលទាំងអស់ / View All'}
              </button>
            </div>
            <div className="superdash-activity-list">
              {recentActivities.length === 0 ? (
                <div className="superdash-empty">
                  <AlertTriangle />
                  <p>No recent activity yet.</p>
                </div>
              ) : recentActivities.map(item => (
                <div className="superdash-activity" key={item.key}>
                  <div className={`superdash-activity__icon is-${item.tone}`}>{item.icon}</div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.subtitle}</p>
                  </div>
                  <time>{item.time || 'N/A'}</time>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showAllReports && (
        <section className="superdash-report-inline" aria-label="All submitted reports">
          <div className="superdash-report-card">
            <div className="superdash-report-card__header">
              <div>
                <h3>ផ្ទាំងគ្រប់គ្រងទិន្នន័យរបាយការណ៍</h3>
                <p>ស្ថិតិសង្ខេបនៃការបញ្ជូនរបាយការណ៍ និងបញ្ជីរបាយការណ៍ទាំងអស់</p>
              </div>
              <label className="superdash-report-search">
                <Search />
                <input
                  type="search"
                  value={reportSearchQuery}
                  onChange={(event) => setReportSearchQuery(event.target.value)}
                  placeholder="ស្វែងរកតាម អតិថិជន លេខស៊េរី ឧបករណ៍ ក្រុមហ៊ុន..."
                />
              </label>
            </div>

            <div className="superdash-report-metrics">
              <div><FileCheck2 /><span>របាយការណ៍សរុប</span><strong>{filteredSubmittedReports.length}</strong></div>
              <div><Users /><span>អតិថិជន</span><strong>{new Set(filteredSubmittedReports.map(r => r.customer_name)).size}</strong></div>
              <div><MapPin /><span>ទីតាំង</span><strong>{new Set(filteredSubmittedReports.map(r => r.customer_address)).size}</strong></div>
              <div><Building2 /><span>ផលិត</span><strong>{manufactureCount}</strong></div>
              <div><ShieldCheck /><span>តម្លើង</span><strong>{installationCount}</strong></div>
              <div><Clock3 /><span>ជួសជុល</span><strong>{repairCount}</strong></div>
            </div>

            <div className="superdash-report-analytics">
              <div className="superdash-analysis-card">
                <div className="superdash-analysis-title">
                  <BarChart3 />
                  <div>
                    <h4>លទ្ធផលសេវាកម្មមាត្រាសាស្ត្រតាមប្រភេទ</h4>
                    <p>Bar Chart of Metrology Services</p>
                  </div>
                </div>
                <div className="superdash-service-bars">
                  {serviceShares.map(item => (
                    <div className={`superdash-service-bar is-${item.tone}`} key={item.key}>
                      <div>
                        <span>{item.icon}</span>
                        <strong>{item.kh} / {item.en}</strong>
                      </div>
                      <em>{item.count}</em>
                      <i style={{ width: `${filteredServiceTotal > 0 ? Math.max(4, (item.count / filteredServiceTotal) * 100) : 0}%` }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="superdash-analysis-card">
                <div className="superdash-analysis-title">
                  <PieChart />
                  <div>
                    <h4>ភាគរយចំណែកសេវាកម្ម</h4>
                    <p>Services Shares Ratio</p>
                  </div>
                </div>
                <div className="superdash-share-grid">
                  {serviceShares.map(item => (
                    <div className={`superdash-share-item is-${item.tone}`} key={item.key}>
                      <span>{item.icon}</span>
                      <div>
                        <strong>{percent(item.count, filteredServiceTotal)}</strong>
                        <p>{item.kh} / {item.en}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="superdash-report-table-card">
              <div className="superdash-report-table-title">
                <div>
                  <h4>តារាងរបាយការណ៍លម្អិត ({filteredSubmittedReports.length} កំណត់ត្រា)</h4>
                  <p>ចម្រោះ និងបង្ហាញបញ្ជីរបាយការណ៍</p>
                </div>
              </div>
              {filteredSubmittedReports.length === 0 ? (
                <div className="superdash-empty">
                  <AlertTriangle />
                  <p>{reportSearchQuery ? 'រកមិនឃើញរបាយការណ៍តាមពាក្យស្វែងរកនេះទេ។' : 'មិនទាន់មានទិន្នន័យរបាយការណ៍នៅឡើយទេ។'}</p>
                </div>
              ) : (
                <div className="superdash-report-table-wrap">
                  <table className="superdash-report-table">
                    <thead>
                      <tr>
                        <th>ល.រ</th>
                        <th>ក្រុមហ៊ុន</th>
                        <th>អតិថិជន និងអាសយដ្ឋាន</th>
                        <th>ឧបករណ៍</th>
                        <th>លេខស៊េរី / វិសាលភាព</th>
                        <th>ប្រភេទសេវា</th>
                        <th>ខែ / ឆ្នាំ</th>
                        <th>ស្ថានភាព</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmittedReports.map((report, index) => (
                        <tr key={report.id}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{report.company_name_kh || 'Company'}</strong>
                            <p>License: {report.license_number || 'N/A'}</p>
                          </td>
                          <td>
                            <strong>{report.customer_name || 'N/A'}</strong>
                            <p>{report.customer_address || 'N/A'}</p>
                          </td>
                          <td>{report.measuring_instrument || 'N/A'}</td>
                          <td>
                            <strong>{report.instrument_serial_number || 'N/A'}</strong>
                            <p>{report.scope_of_weight_measure || ''}</p>
                          </td>
                          <td><span className={`superdash-service-badge is-${report.service_type.toLowerCase()}`}>{report.service_type}</span></td>
                          <td>{report.report_month || '--'} {report.report_year || ''}</td>
                          <td><span className="superdash-status-badge">{report.report_status || 'Submitted'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="superdash-panel superdash-summary">
        <div className="superdash-panel__header">
          <h3>សង្ខេប / Summary</h3>
        </div>
        <div className="superdash-summary__grid">
          <div><span>ក្រុមហ៊ុនសរុប</span><small>Total Companies</small><strong>{totalLicenses}</strong></div>
          <div><span>មានអាជ្ញាប័ណ្ណ</span><small>Licensed</small><strong>{licensed}</strong></div>
          <div><span>គ្មានអាជ្ញាប័ណ្ណ</span><small>Not Licensed</small><strong>{Math.max(0, totalLicenses - licensed)}</strong></div>
          <div><span>ភ្ជាប់ Telegram</span><small>Telegram Linked</small><strong>{telegramLinked}</strong></div>
          <div><span>គ្មានទីតាំង GPS</span><small>No GPS Location</small><strong>{noGps}</strong></div>
        </div>
      </section>

      <TopServiceCompanies reports={reports} users={users} />
    </div>
  );
}
