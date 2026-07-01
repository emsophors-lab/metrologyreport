import React from "react";
import "./nmc-official-theme.css";

/*
  Optional example component for the NMC official theme.
  Main reusable file: nmc-official-theme.css
*/

type StatCardProps = {
  labelKh: string;
  labelEn: string;
  value: string | number;
  variant?: "primary" | "success" | "warning" | "danger";
};

function StatCard({ labelKh, labelEn, value, variant }: StatCardProps) {
  return (
    <div className={`nmc-stat-card ${variant ? `nmc-stat-card--${variant}` : ""}`}>
      <div className="nmc-stat-card__label">{labelKh}</div>
      <div className="nmc-stat-card__label">{labelEn}</div>
      <div className="nmc-stat-card__value">{value}</div>
    </div>
  );
}

export default function NMCOfficialThemeExample() {
  return (
    <div className="nmc-page">
      <header className="nmc-official-header">
        <div className="nmc-official-header__brand">
          <img className="nmc-official-header__logo" src="/NMCLogo.png" alt="National Metrology Center" />
          <div>
            <h1 className="nmc-official-header__title-kh">
              ក្រសួងឧស្សាហកម្ម វិទ្យាសាស្ត្រ បច្ចេកវិទ្យា និងនវានុវត្តន៍
            </h1>
            <div className="nmc-official-header__title-en">
              មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ - National Metrology Center of Cambodia
            </div>
          </div>
        </div>
        <div className="nmc-official-header__actions">
          <span className="nmc-pill nmc-pill--gold">ខ្មែរ</span>
          <span className="nmc-pill">EN</span>
          <span className="nmc-pill">Superadmin</span>
        </div>
      </header>

      <main className="nmc-content">
        <section className="nmc-page-title-card">
          <span className="nmc-page-title-card__badge">NMC OFFICIAL SYSTEM</span>
          <h1>ប្រព័ន្ធគ្រប់គ្រងអាជ្ញាប័ណ្ណមាត្រាសាស្ត្រ</h1>
          <p>
            Enterprise licensing, monthly reports, Telegram notifications, backup data,
            and official digital services for the National Metrology Center.
          </p>
        </section>

        <section className="nmc-stats-grid">
          <StatCard labelKh="សរុប" labelEn="Total Licenses" value={128} variant="primary" />
          <StatCard labelKh="សកម្ម" labelEn="Active" value={98} variant="success" />
          <StatCard labelKh="ជិតផុតកំណត់" labelEn="Expiring Soon" value={15} variant="warning" />
          <StatCard labelKh="ផុតកំណត់" labelEn="Expired" value={15} variant="danger" />
          <StatCard labelKh="ភ្ជាប់ Telegram" labelEn="Telegram Linked" value={76} />
          <StatCard labelKh="គ្មានទីតាំង GPS" labelEn="No GPS" value={7} />
        </section>

        <section className="nmc-form-section">
          <div className="nmc-form-section__header">
            ១. ព័ត៌មានសហគ្រាស / Company Information
          </div>
          <div className="nmc-form-section__body">
            <div className="nmc-form-grid">
              <div className="nmc-field">
                <label>ឈ្មោះសហគ្រាស / Company Name</label>
                <input placeholder="បញ្ចូលឈ្មោះសហគ្រាស..." />
              </div>
              <div className="nmc-field">
                <label>លេខអាជ្ញាប័ណ្ណ / License Number</label>
                <input placeholder="LIC-NMC-00018" />
              </div>
            </div>
          </div>
        </section>

        <section className="nmc-card">
          <div className="nmc-card__header">
            <h2 className="nmc-card__title">បញ្ជីអាជ្ញាប័ណ្ណ / License Registry</h2>
            <button className="nmc-btn nmc-btn--primary">+ បន្ថែម / Add License</button>
          </div>
          <div className="nmc-card__body">
            <div className="nmc-table-wrap">
              <table className="nmc-table">
                <thead>
                  <tr>
                    <th>ល.រ</th>
                    <th>សហគ្រាស</th>
                    <th>លេខអាជ្ញាប័ណ្ណ</th>
                    <th>កាលបរិច្ឆេទចេញ</th>
                    <th>ផុតកំណត់</th>
                    <th>ស្ថានភាព</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>ABC Co., Ltd.</td>
                    <td>LIC-NMC-00018</td>
                    <td>2026-06-27</td>
                    <td>2029-06-26</td>
                    <td><span className="nmc-badge nmc-badge--active">Active</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="nmc-footer">
        ឆ្នាំ២០២៦ © រក្សាសិទ្ធិគ្រប់យ៉ាងដោយ៖ ​នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម | មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ
      </footer>
    </div>
  );
}
