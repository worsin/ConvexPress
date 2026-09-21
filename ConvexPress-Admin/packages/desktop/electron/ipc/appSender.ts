import { isDev } from "../utils/platform.js";
import { isAppRendererSender } from "./setupSender.js";

export function assertAppSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isAppRendererSender(event.sender.getURL(), { development: isDev() })) {
    throw new Error("Updates can only be requested from the ConvexPress app.");
  }
}
