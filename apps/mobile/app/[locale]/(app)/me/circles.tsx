import { privateMetadata } from "@/seo/metadata";
import { Home } from "@/features/Home";

// v1 /me/circles: every Cerchia of mine, and the two ways to get another one (join with a code, create).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Home />;
}
