import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const cube = new URL("../fixtures/cube.stl", import.meta.url).pathname;
async function ready(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByLabel("Layer height", { exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
}
async function save(page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}

test("add an installed printer and load its compatible material and print settings", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get("/api/presets")).json();
  const printer = catalog.printers.find(
    (item) => item.name === "Test Printer B",
  );
  expect(printer).toBeDefined();
  const compatible = await (
    await request.get(
      `/api/presets?printerId=${encodeURIComponent(printer.id)}`,
    )
  ).json();
  await ready(page);
  await page
    .getByRole("button", { name: "＋ Add printer", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add printer" });
  await dialog
    .getByLabel("Printer profile", { exact: true })
    .selectOption(printer.id);
  await dialog
    .getByRole("button", { name: "Add printer", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Printer", { exact: true })).toHaveValue(
    printer.id,
  );
  await expect(page.getByLabel("Filament", { exact: true })).toHaveValue(
    compatible.defaults.filamentId,
  );
  await expect(page.getByLabel("Layer height", { exact: true })).toBeEnabled();
  expect((await save(page)).ids).toEqual(compatible.defaults);
});

test("create a printer, choose a filament and print settings, load a model, rotate and reopen the saved project", async ({
  page,
  request,
}) => {
  const initial = await (await request.get("/api/presets")).json();
  const created = await request.post("/api/presets/custom", {
    data: {
      type: "filament",
      name: `Workshop PETG ${Date.now()}`,
      baseId: initial.defaults.filamentId,
      compatiblePrinterIds: [initial.defaults.printerId],
      settings: { filament_type: ["PETG"], nozzle_temperature: ["235"] },
    },
  });
  expect(created.ok()).toBe(true);
  await ready(page);
  await page
    .getByRole("button", { name: "＋ Add printer", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add printer" });
  await dialog.getByLabel("Create a custom printer").check();
  await dialog
    .getByLabel("Printer name", { exact: true })
    .fill(`Workshop printer ${Date.now()}`);
  await dialog.getByLabel("Printer width").fill("220");
  await dialog.getByLabel("Printer depth").fill("220");
  await dialog
    .getByRole("button", { name: "Create printer", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Printer", { exact: true })).toContainText(
    "Workshop printer",
  );
  await expect(page.getByLabel("Layer height", { exact: true })).toBeEnabled();
  const choices = await page
    .getByLabel("Filament", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options.map((o) => ({ value: o.value, text: o.textContent })),
    );
  expect(choices.length).toBeGreaterThan(1);
  const material = choices.find((o) => /PETG/i.test(o.text)) || choices[1];
  await page
    .getByLabel("Filament", { exact: true })
    .selectOption(material.value);
  await expect(page.getByLabel("Layer height", { exact: true })).toBeEnabled();
  await page.getByLabel("Layer height", { exact: true }).fill("0.24");
  await page.getByLabel("Choose a 3D model").setInputFiles(cube);
  await expect(page.locator(".scene-object-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  const rotation = page.getByRole("region", { name: "Rotate model" });
  await expect(rotation).toBeVisible();
  await rotation
    .getByRole("button", { name: "Rotate Z to 90°", exact: true })
    .click();
  await expect(rotation.getByLabel("Z rotation angle")).toHaveValue("90");
  let project = await save(page);
  expect(project.objects[0].rotation[2]).toBe(90);
  expect(Number(project.overrides.layer_height)).toBe(0.24);
  expect(project.ids.filamentId).toBe(material.value);
  expect(project.ids.printerId).toMatch(/^custom-machine-/);
  await page.reload();
  await expect(page.getByLabel("Layer height", { exact: true })).toBeEnabled();
  await page.getByLabel("Open Orca Web project").setInputFiles({
    name: "Workshop.orca.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByLabel("Layer height", { exact: true })).toHaveValue(
    "0.24",
  );
  await expect(page.getByLabel("Filament", { exact: true })).toHaveValue(
    material.value,
  );
  await expect(page.getByLabel("Printer", { exact: true })).toHaveValue(
    project.ids.printerId,
  );
  await expect(page.getByLabel("rotation Z", { exact: true })).toHaveValue(
    "90",
  );
});
test("visible rotation presets update every axis, support free angles, and undo as individual actions", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Choose a 3D model").setInputFiles(cube);
  const toolbar = page.getByRole("toolbar", { name: "Model tools" });
  for (const name of ["Move", "Rotate", "Scale", "Place on face"])
    await expect(
      toolbar.getByRole("button", { name, exact: true }).locator(".tool-label"),
    ).toBeVisible();
  const buttonBoxes = await toolbar
    .locator(".primary-tools button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const b = button.getBoundingClientRect(),
          label = button.querySelector(".tool-label")?.getBoundingClientRect();
        return { x: b.x, right: b.right, labelRight: label?.right };
      }),
    );
  for (let i = 0; i < buttonBoxes.length; i++) {
    if (i)
      expect(buttonBoxes[i].x).toBeGreaterThanOrEqual(buttonBoxes[i - 1].right);
    if (buttonBoxes[i].labelRight)
      expect(buttonBoxes[i].labelRight).toBeLessThanOrEqual(
        buttonBoxes[i].right,
      );
  }
  await toolbar.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(
    toolbar.getByRole("button", { name: "Rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const rotation = page.getByRole("region", { name: "Rotate model" });
  await expect(rotation.getByLabel("Snap to 90°")).toBeChecked();
  for (const [axis, angle] of [
    ["X", 90],
    ["Y", 180],
    ["Z", 270],
  ]) {
    await rotation
      .getByRole("button", { name: `Rotate ${axis} to ${angle}°`, exact: true })
      .click();
    await expect(rotation.getByLabel(`${axis} rotation angle`)).toHaveValue(
      String(angle),
    );
  }
  expect((await save(page)).objects[0].rotation).toEqual([90, 180, 270]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rotation.getByLabel("Z rotation angle")).toHaveValue("0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(rotation.getByLabel("Z rotation angle")).toHaveValue("270");
  await rotation.getByLabel("Snap to 90°").uncheck();
  await rotation.getByLabel("Z rotation angle").fill("37");
  expect((await save(page)).objects[0].rotation[2]).toBe(37);
  await page.screenshot({
    path: test.info().outputPath("rotation-controls.png"),
  });
});

test("dragging the rotation ring shows live snapped angles, commits one Undo step, and supports free rotation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await page.getByLabel("Choose a 3D model").setInputFiles(cube);
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page
    .locator(".scene-views")
    .getByRole("button", { name: "Top", exact: true })
    .click();
  const canvas = page.getByRole("img", { name: "Interactive 3D model view" }),
    rotation = page.getByRole("region", { name: "Rotate model" });
  await page.waitForTimeout(250);
  async function drag(distance) {
    const box = await canvas.boundingBox(),
      radius = (box.height * 1.9) / 16;
    const x = box.x + box.width / 2 + radius / Math.sqrt(2),
      y = box.y + box.height / 2 + radius / Math.sqrt(2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + box.height * distance, y, { steps: 12 });
  }
  await drag(0.11);
  await expect(rotation.getByLabel("Z rotation angle")).toBeDisabled();
  await expect
    .poll(async () =>
      Number(await rotation.getByLabel("Z rotation angle").inputValue()),
    )
    .toBe(90);
  await page.mouse.up();
  await expect(rotation.getByLabel("Z rotation angle")).toBeEnabled();
  expect(Math.abs((await save(page)).objects[0].rotation[2])).toBeCloseTo(
    90,
    7,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rotation.getByLabel("Z rotation angle")).toHaveValue("0");
  await rotation.getByLabel("Snap to 90°").uncheck();
  await drag(0.04);
  await expect(rotation.getByLabel("Z rotation angle")).toBeDisabled();
  const free = Number(
    await rotation.getByLabel("Z rotation angle").inputValue(),
  );
  expect(free).toBeGreaterThan(5);
  expect(free).toBeLessThan(80);
  await page.mouse.up();
  expect(Math.abs((await save(page)).objects[0].rotation[2])).toBeCloseTo(
    free,
    0,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rotation.getByLabel("Z rotation angle")).toHaveValue("0");
});
