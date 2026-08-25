import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getReport, getVideos } from "@/lib/api";
import type { DamageEvent } from "@/lib/types";

const REVIEW_LABEL: Record<DamageEvent["review_status"], string> = {
  pending: "Ausstehend",
  accepted: "Akzeptiert",
  edited: "Bearbeitet",
  rejected: "Abgelehnt",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "latest") {
    const videos = await getVideos().catch(() => []);
    if (videos.length === 0) {
      redirect("/videos");
    }
    redirect(`/reports/${videos[0].id}`);
  }
  const report = await getReport(id).catch(() => null);
  if (!report) {
    notFound();
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Bericht</p>
          <h1>{report.video.original_filename}</h1>
          <p className="muted">Erzeugt am {new Date(report.generated_at).toLocaleString("de-DE")}</p>
        </div>
        <Link className="secondary" href={`/videos/${report.video.id}`}>
          Zur Analyse
        </Link>
      </header>
      <div className="stat-strip">
        <div className="stat">
          <strong>{report.summary.event_count}</strong>
          <span className="muted">Ereignisse</span>
        </div>
        <div className="stat">
          <strong>{report.summary.accepted}</strong>
          <span className="muted">Akzeptiert</span>
        </div>
        <div className="stat">
          <strong>{report.summary.rejected}</strong>
          <span className="muted">Abgelehnt</span>
        </div>
      </div>
      <section className="panel section-top">
        <h2>Ereignis-Tabelle</h2>
        <table className="report-table">
          <thead>
            <tr>
              <th>Klasse</th>
              <th>Zeit</th>
              <th>Meter</th>
              <th>Konfidenz</th>
              <th>Bewertung</th>
            </tr>
          </thead>
          <tbody>
            {report.events.map((event) => (
              <tr key={event.id}>
                <td>{event.class_name}</td>
                <td>{event.start_time_seconds.toFixed(1)} s</td>
                <td>{event.meter_start?.toFixed(2) ?? "offen"}</td>
                <td>{(event.confidence * 100).toFixed(0)}%</td>
                <td>{REVIEW_LABEL[event.review_status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
