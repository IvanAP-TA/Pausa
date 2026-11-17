import type { Instrumentation } from "next";
import { reportToSentry } from "@/lib/core/sentry";

/** Every unhandled server error is sent to Sentry when SENTRY_DSN is set; otherwise this does nothing. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await reportToSentry(process.env.SENTRY_DSN, err, {
    path: request.path,
    method: request.method,
    route: context.routePath,
    kind: context.routeType,
    environment: process.env.NODE_ENV,
  });
};
