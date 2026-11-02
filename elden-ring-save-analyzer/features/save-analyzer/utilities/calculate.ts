import allItems from "@public/data/all_items.json";
import alteredArmour from "@public/data/altered_armor.json";
import bellBearings from "@public/data/bell_bearings.json";
import bosses from "@public/data/bosses.json";
import cookbooks from "@public/data/cookbooks.json";
import crystalTears from "@public/data/crystal_tears.json";
import dlc_items from "@public/data/dlc_items.json";
import eventFlag from "@public/data/eventflag_bst.json";
import gestures from "@public/data/gestures.json";
import sitesOfGrace from "@public/data/graces.json";
import itemCounter from "@public/data/item_counter.json";
import tools from "@public/data/tools.json";
import unobtainableItems from "@public/data/unobtainable.json";
import itemDictTemplate from "@public/data/item_dict_template.json";
import whetblades from "@public/data/whetblades.json";
import { buffer_equal } from "./is-save-valid";
import readSaveFile from "./read-save-file";

// The save holds 10 character slots at fixed byte ranges. Returns each as a
// Uint8Array view (subarray shares memory, nothing is copied).
// Each range is [start, end]; the "+ 1" makes the end inclusive.
const get_slot_ls = (dat: Uint8Array) => {
  const slot1 = dat.subarray(0x00000310, 0x0028030f + 1);
  const slot2 = dat.subarray(0x00280320, 0x050031f + 1);
  const slot3 = dat.subarray(0x500330, 0x78032f + 1);
  const slot4 = dat.subarray(0x780340, 0xa0033f + 1);
  const slot5 = dat.subarray(0xa00350, 0xc8034f + 1);
  const slot6 = dat.subarray(0xc80360, 0xf0035f + 1);
  const slot7 = dat.subarray(0xf00370, 0x118036f + 1);
  const slot8 = dat.subarray(0x1180380, 0x140037f + 1);
  const slot9 = dat.subarray(0x1400390, 0x168038f + 1);
  const slot10 = dat.subarray(0x16803a0, 0x190039f + 1);
  return [
    slot1,
    slot2,
    slot3,
    slot4,
    slot5,
    slot6,
    slot7,
    slot8,
    slot9,
    slot10,
  ];
};

// Returns the index of the first occurrence of `pattern` inside `mylist`,
// or undefined if it isn't found.
const findSubarray = (mylist: Uint8Array, pattern: Uint8Array) => {
  for (let i = 0; i < mylist.byteLength; i++) {
    // Cheap first-byte check before comparing the whole pattern
    if (
      mylist[i] === pattern[0] &&
      buffer_equal(mylist.subarray(i, i + pattern.byteLength), pattern)
    )
      return i;
  }
};

//Cuts the raw inventory bytes out of a slot.
//(`index` and `index1` have no let/const, so they become globals.)
const getInventory = (slot: Uint8Array) => {
  const pattern = new Uint8Array([
    0xb0, 0xad, 0x01, 0x00, 0x01, 0xff, 0xff, 0xff,
  ]);
  const pattern_dlc = new Uint8Array([0xb0, 0xad, 0x01, 0x00, 0x01]);

  // Try the base-game marker first. If subfinder() found nothing it returns
  // Try the base-game marker first. If findSubarray() found nothing it returns
  // undefined, undefined + number = NaN, and `!NaN` is true, so we fall back
  // to the DLC marker and remember that this is a DLC-format save.
  let isDlcFile = false;
  let index = findSubarray(slot, pattern) + pattern.byteLength + 8;
  if (!index) {
    index = findSubarray(slot, pattern_dlc) + pattern_dlc.byteLength + 3;
    isDlcFile = true;
  }
  // The inventory ends at the first run of 50 zero bytes after the start
  const index1 =
    findSubarray(
      slot.subarray(index, slot.byteLength),
      new Uint8Array(50).fill(0),
    ) +
    index +
    6;
  return slot.subarray(index, index1);
};

// Pulls the two things we need out of the chosen slot:
//   event_flags - bitfield for bosses / graces / cookbooks / etc.
//   id_list     - hex ID of every inventory entry
const parseSlotData = (saveFile: File, selected_slot: string) => {
  readSaveFile(saveFile).then((file_read) => {
    const saves_array = new Uint8Array(file_read);
    console.log("Saves array length:", saves_array.length);
    console.log("Selected slot:", selected_slot);
    console.log("File read successfully, parsing slot data...");
    const slot = get_slot_ls(saves_array)[0];
    const inventory = Array.from(getInventory(slot));
    console.log("Inventory length:", inventory.length);
    console.log("Inventory data:", inventory);
    //   const event_flags = getEventFlags(slot);
    //   // Entries are 16 bytes (base game) or 8 bytes (DLC format). Chunk them,
    //   // then convert each chunk to an uppercase hex ID to match the JSON keys.
    //   const id_list = split(inventory, isDlcFile ? 8 : 16)
    //     .map((raw_id) => getIdReversed(raw_id).toUpperCase());
    //   return { event_flags, id_list };
    //     });
  });
};

const getOwnedAndNot = (saveFile: File, selected_slot: string) => {
  try {
    // for testing
    parseSlotData(saveFile, selected_slot);

    // the real line
    //const { event_flags, id_list } = parseSlotData(saveFile, selected_slot);

    // Deep copies (JSON round-trip) so the template itself is never modified
    const owned_items = JSON.parse(JSON.stringify(itemDictTemplate));
    const not_owned_items = JSON.parse(JSON.stringify(itemDictTemplate));

    // Process event-flag based categories
    // processFlags("bosses", event_flags, owned_items, not_owned_items);
    // processFlags("graces", event_flags, owned_items, not_owned_items, true); // grouped by region
    // processFlags("cookbooks", event_flags, owned_items, not_owned_items);
    // processFlags("bell_bearings", event_flags, owned_items, not_owned_items);
    // processFlags("whetblades", event_flags, owned_items, not_owned_items);

    // Process inventory-based categories
    // processInventoryItems(id_list, owned_items, not_owned_items);

    //  return { worked: true, owned: owned_items, "not-owned": not_owned_items, counter: item_counter };
  } catch (err) {
    console.error(err);
    return { worked: false, owned: null, "not-owned": null, counter: null };
  }
};

const calculate = (selectedName: string, saveFile: File) => {
  const result = getOwnedAndNot(saveFile, selectedName); // parse the save and classify items
  // if (result["worked"]) {
  // Load the HTML skeletons for the two result sections, then show the
  // // collapse buttons and add "owned/total" counters to the headings.
  // $("#owned").load("page_parts.html #owned_section", () => {
  //   $("#not-owned").load("page_parts.html #not-owned-section", () => {
  //     // document.getElementById("collapse_button1").style.display = "block";
  //     // document.getElementById("collapse_button2").style.display = "block";
  //     addFraction();
  //   });
  // });
  // }
};

export default calculate;
