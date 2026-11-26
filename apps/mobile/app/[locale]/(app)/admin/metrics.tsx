import { privateMetadata } from "@/seo/metadata";
import { Metrics } from "@/features/admin/Metrics";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Metrics />;
}
