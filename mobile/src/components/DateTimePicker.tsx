import React from "react";
import { Platform } from "react-native";
import RNDateTimePicker from "@react-native-community/datetimepicker";
import { MIN_PICKABLE_DATE, MAX_PICKABLE_DATE } from "../lib/calendar";

type Props = React.ComponentProps<typeof RNDateTimePicker>;

/**
 * The native date/time picker, with both bounds always set. Every picker in
 * the app goes through this one instead of importing the library directly.
 *
 * Reported, over and over: the Time field on the edit and manual-entry
 * sheets snapping back to 2:00 AM on every change, the wheel itself sitting
 * on "2 00 AM". Re-seeding the value and memoizing the sheet didn't fix it,
 * because the value was never the problem. iOS was clamping each pick to a
 * maximum date of 1 Jan 1970, 00:00 UTC, which is 2:00 AM on a Cairo clock.
 *
 * Where that maximum comes from: under the new architecture, iOS reuses
 * native picker views. The picker only applies a prop when it differs from
 * that same view's previous props, and a bound left unset arrives as 0, not
 * "none". So a view last used by a date picker with a `maximumDate` (manual
 * entry, Insights, vaccines, date of birth), then reused by a time field that
 * sets none, sees its maximum "change" to 0. The picker then applies it
 * literally, as the epoch. Once that happens, every time picked is later than
 * the maximum and gets clamped straight back to it. Only when a view happened
 * to be reused, which is why it came and went.
 *
 * Always passing real bounds leaves nothing for a reused view to reset: the
 * widest range the app accepts anywhere, unless the caller narrows it.
 * Android's picker is a dialog with no reuse, so it keeps whatever the caller
 * passes, same as before.
 */
export default function DateTimePicker(props: Props) {
  if (Platform.OS !== "ios") return <RNDateTimePicker {...props} />;
  return (
    <RNDateTimePicker
      {...props}
      minimumDate={props.minimumDate ?? MIN_PICKABLE_DATE}
      maximumDate={props.maximumDate ?? MAX_PICKABLE_DATE}
    />
  );
}
