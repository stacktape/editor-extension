# Testing the Stacktape extension

## 1. Launch it

1. Open the `editor-extension` folder in VS Code.
2. Press **F5** (or Run ▸ **Launch Extension (examples)**).
   - VS Code builds the extension and opens a second window titled **[Extension Development Host]** with this `examples/` folder already open.
3. In that new window, open **`app.stacktape.yml`**.

> Two launch configs exist: **Launch Extension (examples)** disables your other extensions for a clean test; **Launch Extension (with your installed extensions)** keeps them, so you can confirm we don't fight the official YAML extension.

## 2. Check the language features (in `app.stacktape.yml`)

| # | Feature | What to press / do | Expected result |
|---|---------|--------------------|-----------------|
| 1 | **Language / precedence** | Look at the **bottom-right status bar** | Says **Stacktape** (not "YAML") |
| 2 | **Reference validation** | Look at `ghostTable`, `missingTable`, `nope` (and open Problems with **Ctrl+Shift+M**) | Yellow squiggles: *Unknown resource/variable …* |
| 3 | **No false positives** | Look at `postsTable` and `appName` | No "unknown" warning on them |
| 4 | **Hover** | Hover the mouse over **`postsTable`** inside `$ResourceParam('postsTable', …)` | Tooltip: *References resource **postsTable** of type `dynamo-db-table`* |
| 5 | **Go to definition** | Click **`postsTable`** in that directive, press **F12** (or Ctrl+Click) | Cursor jumps up to the `postsTable:` definition |
| 6 | **Completion** | Put the cursor **between the empty quotes** in `$ResourceParam('')`, press **Ctrl+Space** | Suggests `postsTable`, `apiGateway`, `api` |
| 7 | **Schema hover/complete** | Hover a key like `type:`; or after `type: ` press **Ctrl+Space** | Schema docs / value suggestions (existing behavior still works) |

## 3. Check the commands

With `app.stacktape.yml` open:

- **Editor title bar** (top-right of the editor): a **Deploy** (rocket) and **Preview** icon.
- **Right-click** in the editor → **Stacktape: …** entries.
- **Command Palette** (**Ctrl+Shift+P**) → type **Stacktape**.
- Run **Stacktape: Validate config** → it prompts for **stage**, then **region**, then opens a terminal running
  `stacktape validate --stage … --region … --configPath …`.
  *(If the Stacktape CLI isn't installed you'll see "command not found" — that still confirms the command is wired correctly.)*

Then open **`app.stacktape.ts`** → the same buttons/commands appear there too (the schema features intentionally don't apply to `.ts`).

## 4. Check the settings

Open Settings (**Ctrl+,**) and search **stacktape**:

- Turn **Validate References** off → the *Unknown resource/variable* squiggles disappear.
- Set **Trace: Server** = **verbose** → View ▸ Output ▸ choose the **Stacktape** channel → you'll see LSP traffic.

## 5. Server-only smoke test (no UI)

From a terminal in the `editor-extension` folder:

```
pnpm build && pnpm smoke
```

Expect **8/8 checks passed**.
