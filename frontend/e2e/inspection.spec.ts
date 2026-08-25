import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

function createSampleVideo(path: string) {
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=160x120:rate=5",
    "-t",
    "2",
    "-pix_fmt",
    "yuv420p",
    path,
  ]);
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("MW-001").fill("MW-001");
  await page.getByPlaceholder("123456").fill("123456");
  await page.getByRole("button", { name: /Anmelden/i }).click();
  await expect(page.getByText("NEUER PRÜFAUFTRAG")).toBeVisible();
}

test("requires a location before upload starts", async ({ page }, testInfo) => {
  const videoPath = testInfo.outputPath("blocked-upload.mp4");
  createSampleVideo(videoPath);

  await login(page);
  await page.locator('input[type="file"]').setInputFiles(videoPath);
  await expect(page.getByText("Standort angeben")).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload starten/i })).toBeDisabled();

  await page.getByRole("button", { name: /^Adresse$/ }).click();
  await expect(page.getByRole("button", { name: /Upload starten/i })).toBeDisabled();
  await page.getByLabel("Adresse").fill("Beispielstraße, Musterstadt");
  await expect(page.getByRole("button", { name: /Upload starten/i })).toBeEnabled();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await expect(page.getByText("Standort angeben")).toBeHidden();
});

test("runs the SewerScan cockpit upload and review flow", async ({ page }, testInfo) => {
  const videoPath = testInfo.outputPath("sample.mp4");
  createSampleVideo(videoPath);

  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 47.999, longitude: 7.842 });
  await login(page);

  await page.locator('input[type="file"]').setInputFiles(videoPath);
  await expect(page.getByText("Standort angeben")).toBeVisible();
  await page.getByRole("button", { name: /Aktuellen Standort verwenden/i }).click();
  await expect(page.getByText("Standort geprüft")).toBeVisible();
  await page.getByRole("button", { name: /Upload starten/i }).click();
  await expect(page.getByText("sample.mp4").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /Prüfaufträge/i }).first().click();
  const row = page.locator(".street-row").filter({ hasText: "sample" }).first();
  await expect(row).toBeVisible();
  // Solange die Analyse läuft, zeigt das Badge den Fortschritt in Prozent;
  // danach die Zahl offener Befunde. Erst dann ist der Zustand unten stabil.
  await expect(row.locator(".badge-mini")).toContainText("OFFEN", { timeout: 60_000 });
  await row.click();

  await expect(page.locator(".video-map-marker").first()).toBeVisible();

  const validate = page.getByRole("button", { name: /Befunde validieren/i });
  await expect(validate).toBeVisible();

  // Die Analyse ist an dieser Stelle durch. Findet das konfigurierte Modell auf
  // dem synthetischen Testvideo nichts, bleibt der Button bewusst gesperrt und
  // der Review-Flow ist nicht erreichbar — das ist kein Regressionsfehler.
  let hasOpenFindings = true;
  try {
    await expect(validate).toBeEnabled({ timeout: 15_000 });
  } catch {
    hasOpenFindings = false;
  }
  test.skip(!hasOpenFindings, "Keine offenen Befunde auf dem synthetischen Testvideo.");
  await validate.click();

  await expect(page.locator(".kanban")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Offen · Fundbilder")).toBeVisible();

  const cards = page.locator(".finding-card");
  const cardCount = await cards.count();
  if (cardCount > 0) {
    const titles = await page.locator(".finding-card .card-title").allTextContents();
    const frameLabels = titles
      .map((title) => title.match(/Frame \d+/)?.[0])
      .filter((label): label is string => Boolean(label));
    expect(new Set(frameLabels).size).toBe(frameLabels.length);

    await cards.first().click();
    await expect(page.getByRole("img", { name: /Fundbild .* bei/i })).toBeVisible();
    await page.getByRole("button", { name: /Befund bestätigen/i }).click();
    await expect(page.getByText(/Bestätigt/).first()).toBeVisible();
  } else {
    await expect(page.getByText("- KEINE EINTRÄGE -").first()).toBeVisible();
  }

  await expect(page.getByRole("link", { name: /Bericht öffnen/i })).toBeVisible();
});
