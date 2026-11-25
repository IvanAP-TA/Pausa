import { privateMetadata } from "@/seo/metadata";
import { Home } from "@/features/Home";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Home />;
}
