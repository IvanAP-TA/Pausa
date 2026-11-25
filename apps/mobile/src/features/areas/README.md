# Message areas

Each area keeps its texts here (or next to its screens) as `<area>.messages.ts`:

```ts
import { registerArea } from "@/i18n/messages";

const it = { diary: { title: "Diario" } } as const;
const en = { diary: { title: "Diary" } } as const;
const es = { diary: { title: "Diario" } } as const;

registerArea("diary", { it, en, es });

declare module "@/i18n/messages" {
  interface AreaMessageMap {
    diary: typeof it;
  }
}
```

Rules: keys are namespaced by the area (`diary.*`), never clash with the base catalogue, all three languages have identical keys,
plurals use the same ICU syntax as `messages/*.json`. Import the file from the screen that uses it so the texts load with it.
A test per area checks the three languages have the same keys (use `registeredAreas()` from `@/i18n/messages`).