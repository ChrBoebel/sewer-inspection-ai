import { afterEach, describe, expect, it, vi } from "vitest";

import { apiUrl, getActiveJobs, jobStreamUrl, mediaUrl, reviewEvent, startAnalysis, suggestVideoLocation, updateVideoLocation, uploadVideo } from "@/lib/api";

describe("api url helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes REST base urls", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    expect(apiUrl("/api/videos")).toBe("http://api.test/api/videos");
    expect(mediaUrl("/files/uploads/demo.mp4")).toBe("http://api.test/files/uploads/demo.mp4");
  });

  it("builds websocket urls", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_BASE_URL", "ws://api.test/");
    expect(jobStreamUrl("job-1")).toBe("ws://api.test/api/jobs/job-1/stream");
  });

  it("sends selected model ids when starting analysis", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-1", video_id: "video-1", model_id: "sewer-hybrid-review" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await startAnalysis("video-1", "sewer-hybrid-review");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/videos/video-1/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: "sewer-hybrid-review" }),
      cache: "no-store"
    });
  });

  it("loads active jobs from the backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "job-1", status: "running" }]
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getActiveJobs()).resolves.toEqual([{ id: "job-1", status: "running" }]);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/jobs/active", {
      cache: "no-store"
    });
  });

  it("uploads manual address metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadVideo(new File(["demo"], "demo.mp4", { type: "video/mp4" }), {
      meterStart: "0",
      meterEnd: "12.5",
      routeName: "Beispielstraße",
      pipeDiameter: "DN 300",
      pipeMaterial: "Beton",
      inspectionDate: "2026-05-10",
      location: {
        mode: "address",
        label: "Beispielstraße",
        address: "Beispielstraße, Musterstadt"
      }
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/videos/upload");
    expect(init.method).toBe("POST");
    expect(init.body.get("route_name")).toBe("Beispielstraße");
    expect(init.body.get("pipe_diameter")).toBe("DN 300");
    expect(init.body.get("pipe_material")).toBe("Beton");
    expect(init.body.get("inspection_date")).toBe("2026-05-10");
    expect(init.body.get("location_label")).toBe("Beispielstraße");
    expect(init.body.get("location_address")).toBe("Beispielstraße, Musterstadt");
    expect(init.body.get("location_latitude")).toBeNull();
  });

  it("uploads shared browser location metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadVideo(new File(["demo"], "demo.mp4", { type: "video/mp4" }), {
      location: {
        mode: "shared",
        label: "Aktueller Standort",
        latitude: "47.999",
        longitude: "7.842"
      }
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body.get("location_label")).toBe("Aktueller Standort");
    expect(init.body.get("location_latitude")).toBe("47.999");
    expect(init.body.get("location_longitude")).toBe("7.842");
  });

  it("updates and suggests video locations", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video-1", location: { status: "suggested" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateVideoLocation("video-1", { latitude: 47.999, longitude: 7.842, status: "confirmed" });
    await suggestVideoLocation("video-1", "Beispielstraße");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://api.test/api/videos/video-1/location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: 47.999, longitude: 7.842, status: "confirmed" }),
      cache: "no-store"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://api.test/api/videos/video-1/location/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Beispielstraße" }),
      cache: "no-store"
    });
  });

  it("sends compact reminder review payloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "event-1", review_status: "accepted" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await reviewEvent("event-1", "accepted", "check later", {
      reminderDueAt: "2026-11-10T00:00:00.000Z",
      resolveReminder: true
    });

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/events/event-1/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "accepted",
        note: "check later",
        reminder_due_at: "2026-11-10T00:00:00.000Z",
        resolve_reminder: true
      }),
      cache: "no-store"
    });
  });
});
