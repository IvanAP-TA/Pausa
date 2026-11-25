import { privateMetadata } from "@/seo/metadata";
import { SerataRoom } from "@/features/serata/SerataRoom";

// The room of one Serata. It lives under (app) for the shell and the session, but does NOT require sign-in: a person with no
// session gets the guest door (SerataRoom decides), so the route is public in the sense that matters (no redirect to /sign-in).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <SerataRoom />;
}
