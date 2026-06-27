import React, { Component, useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import nmcLogo from "./NMClogo.png";

/**
 * EnterpriseLicenseMapView
 * ------------------------------------------------------------
 * Purpose:
 * Render a real OpenStreetMap/Leaflet map for the License Map tab.
 *
 * Use this component ONLY inside:
 * ផែនទីទីតាំងអាជ្ញាប័ណ្ណ / License Map
 *
 * Required packages:
 * npm install leaflet react-leaflet
 * npm install -D @types/leaflet
 */

export type EnterpriseLicenseRecord = Record<string, any>;

export interface EnterpriseLicenseMapViewProps {
  licenses: EnterpriseLicenseRecord[];
  nmcLogoUrl?: string;
  onViewLicense?: (license: EnterpriseLicenseRecord) => void;
  className?: string;
}

const CAMBODIA_CENTER: [number, number] = [12.5657, 104.991];
const PHNOM_PENH_CENTER: [number, number] = [11.5564, 104.9282];

function firstValue(record: EnterpriseLicenseRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function getCompanyName(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "company_name_kh",
      "enterprise_name_kh",
      "business_name_kh",
      "licensee_name_kh",
      "company_name",
      "enterprise_name",
      "business_name",
      "company_name_en",
      "enterprise_name_en",
      "legal_representative_name",
      "representative_name",
      "owner_name",
    ]) || "N/A"
  );
}

function getLicenseNumber(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "license_number",
      "business_license_number",
      "license_no",
      "certificate_number",
    ]) || "N/A"
  );
}

function getStatus(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "license_status",
      "status",
      "current_status",
      "validity_status",
    ]) || "N/A"
  );
}

function getKhmerAddress(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "business_address_kh",
      "company_address_kh",
      "enterprise_address_kh",
      "business_geo_address_kh",
      "address_kh",
      "business_geo_address",
      "business_address",
      "company_address",
      "enterprise_address",
      "address",
    ]) || "មិនមានអាសយដ្ឋានជាភាសាខ្មែរ"
  );
}

function getLatitude(license: EnterpriseLicenseRecord): number | null {
  const value =
    license?.business_latitude ??
    license?.latitude ??
    license?.lat ??
    license?.gps_latitude;

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const lat = Number(value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return lat;
}

function getLongitude(license: EnterpriseLicenseRecord): number | null {
  const value =
    license?.business_longitude ??
    license?.longitude ??
    license?.lng ??
    license?.gps_longitude;

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const lng = Number(value);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return lng;
}

function formatCoordinate(value: number): string {
  return Number(value).toFixed(7).replace(/0+$/, "").replace(/\.$/, "");
}

function createNmcIcon(nmcLogoUrl?: string): L.Icon | L.DivIcon {
  if (nmcLogoUrl && String(nmcLogoUrl).trim() !== "") {
    return L.icon({
      iconUrl: nmcLogoUrl,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
      className: "nmc-logo-leaflet-marker",
    });
  }

  return L.divIcon({
    className: "nmc-fallback-leaflet-marker",
    html:
      '<div style="width:40px;height:40px;border-radius:9999px;background:#353C96;color:white;display:flex;align-items:center;justify-content:center;font-weight:800;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);font-size:11px;">NMC</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function ResizeMapFix() {
  const map = useMap();

  useEffect(() => {
    const timer1 = window.setTimeout(() => map.invalidateSize(), 100);
    const timer2 = window.setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

function FitBoundsToMarkers({
  locations,
}: {
  locations: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    const timers: number[] = [];
    const invalidateSoon = (delay: number) => {
      const timer = window.setTimeout(() => map.invalidateSize(), delay);
      timers.push(timer);
    };

    if (!locations || locations.length === 0) {
      map.setView(CAMBODIA_CENTER, 7);
      invalidateSoon(150);
      return () => timers.forEach(window.clearTimeout);
    }

    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 16);
      invalidateSoon(150);
      return () => timers.forEach(window.clearTimeout);
    }

    const bounds = L.latLngBounds(locations.map((item) => [item.lat, item.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    invalidateSoon(150);
    return () => timers.forEach(window.clearTimeout);
  }, [locations, map]);

  return null;
}

function EnterpriseMarkerPopup({
  license,
  lat,
  lng,
  onViewLicense,
}: {
  license: EnterpriseLicenseRecord;
  lat: number;
  lng: number;
  onViewLicense?: (license: EnterpriseLicenseRecord) => void;
}) {
  const companyName = getCompanyName(license);
  const licenseNumber = getLicenseNumber(license);
  const status = getStatus(license);
  const khmerAddress = getKhmerAddress(license);

  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div style={{ minWidth: 260, maxWidth: 340, fontSize: 13 }}>
      <div style={{ fontWeight: 800, color: "#353C96", marginBottom: 6 }}>
        {companyName}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>លេខអាជ្ញាប័ណ្ណ / License No.:</strong> {licenseNumber}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>ស្ថានភាព / Status:</strong> {status}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>អាសយដ្ឋាន / Address:</strong>
        <div style={{ marginTop: 2, lineHeight: 1.35 }}>{khmerAddress}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <strong>GPS:</strong> {formatCoordinate(lat)}, {formatCoordinate(lng)}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onViewLicense && (
          <button
            type="button"
            onClick={() => onViewLicense(license)}
            style={{
              border: 0,
              borderRadius: 6,
              background: "#353C96",
              color: "#fff",
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            មើលលម្អិត / View
          </button>
        )}

        <a
          href={osmUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            border: "1px solid #353C96",
            borderRadius: 6,
            color: "#353C96",
            padding: "6px 10px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Open OSM
        </a>

        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            border: "1px solid #353C96",
            borderRadius: 6,
            color: "#353C96",
            padding: "6px 10px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Google Maps
        </a>
      </div>
    </div>
  );
}

interface MapErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class MapErrorBoundary extends Component<
  { children: React.ReactNode },
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): MapErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.error("EnterpriseLicenseMapView crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <strong>ផែនទីមិនអាចផ្ទុកបានទេ / Map could not be loaded.</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>{this.state.message}</div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export function EnterpriseLicenseMapView({
  licenses,
  nmcLogoUrl = nmcLogo,
  onViewLicense,
  className = "",
}: EnterpriseLicenseMapViewProps) {
  const validLocations = useMemo(() => {
    return (licenses || [])
      .map((license) => {
        const lat = getLatitude(license);
        const lng = getLongitude(license);
        if (lat === null || lng === null) return null;

        return {
          license,
          lat,
          lng,
          key:
            String(license?.id || "") ||
            `${getLicenseNumber(license)}-${lat}-${lng}`,
        };
      })
      .filter(Boolean) as Array<{
      license: EnterpriseLicenseRecord;
      lat: number;
      lng: number;
      key: string;
    }>;
  }, [licenses]);

  const nmcIcon = useMemo(() => createNmcIcon(nmcLogoUrl), [nmcLogoUrl]);

  return (
    <div className={className}>
      <style>
        {`
          .nmc-license-map .leaflet-container {
            width: 100%;
            height: 100%;
            z-index: 0;
          }
          .nmc-license-map .leaflet-popup-content-wrapper {
            border-radius: 10px;
          }
          .nmc-logo-leaflet-marker {
            border-radius: 9999px;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,.35);
            background: #ffffff;
          }
        `}
      </style>

      <div
        style={{
          border: "1px solid #C9D2E3",
          borderRadius: 16,
          background: "#ffffff",
          padding: 16,
          boxShadow: "0 1px 4px rgba(15, 23, 42, .08)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#353C96",
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 1.25,
              }}
            >
              ផែនទីទីតាំងសហគ្រាសដែលទទួលបានអាជ្ញាប័ណ្ណ
            </h2>
            <div style={{ color: "#475569", fontWeight: 700, marginTop: 4 }}>
              Map of Licensed Enterprises
            </div>
          </div>

          <div
            style={{
              border: "1px solid #C9D2E3",
              borderRadius: 10,
              padding: "8px 12px",
              color: "#0f172a",
              background: "#f8fafc",
              fontWeight: 800,
            }}
          >
            GPS Locations: {validLocations.length}
          </div>
        </div>

        {validLocations.length === 0 && (
          <div
            style={{
              marginBottom: 12,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e",
              borderRadius: 10,
              padding: 12,
              fontWeight: 700,
            }}
          >
            មិនមានទីតាំងសហគ្រាសសម្រាប់បង្ហាញលើផែនទីទេ។ សូមបញ្ចូល Latitude
            និង Longitude ក្នុងទម្រង់អាជ្ញាប័ណ្ណជាមុនសិន។
            <br />
            No licensed enterprise locations are available on the map.
          </div>
        )}

        <MapErrorBoundary>
          <div
            className="nmc-license-map"
            style={{
              width: "100%",
              height: "600px",
              minHeight: "420px",
              border: "1px solid #C9D2E3",
              borderRadius: 12,
              overflow: "hidden",
              background: "#f8fafc",
            }}
          >
            <MapContainer
              center={
                validLocations.length === 1
                  ? [validLocations[0].lat, validLocations[0].lng]
                  : PHNOM_PENH_CENTER
              }
              zoom={validLocations.length === 1 ? 16 : 12}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ width: "100%", height: "100%" }}
            >
              <ResizeMapFix />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {validLocations.map(({ license, lat, lng, key }) => (
                <Marker key={key} position={[lat, lng]} icon={nmcIcon}>
                  <Popup>
                    <EnterpriseMarkerPopup
                      license={license}
                      lat={lat}
                      lng={lng}
                      onViewLicense={onViewLicense}
                    />
                  </Popup>
                </Marker>
              ))}

              <FitBoundsToMarkers
                locations={validLocations.map((item) => ({
                  lat: item.lat,
                  lng: item.lng,
                }))}
              />
            </MapContainer>
          </div>
        </MapErrorBoundary>
      </div>
    </div>
  );
}

export default EnterpriseLicenseMapView;
