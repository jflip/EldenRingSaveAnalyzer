/* =============================================================================
 * OVERVIEW
 * -----------------------------------------------------------------------------
 * Reads an Elden Ring save file (.sl2) entirely in the browser and works out
 * which items / bosses / graces / cookbooks etc. the chosen character owns.
 *
 * Flow:
 *   1. User picks a save file             -> "change" listener on #savefile
 *   2. File is checked for the BND4 header -> character names fill the dropdown
 *   3. User picks a slot and clicks Calculate -> calculate()
 *   4. getJsonFiles() loads the item databases from assets/json/
 *   5. getOwnedAndNot() parses the slot's bytes and splits every known item
 *      into "owned" and "not owned" (plus counters)
 *   6. page_parts.html is loaded in and cards are rendered per category
 *      (getCategorySection is called from the page's collapse/expand UI)
 *
 * Two ways ownership is detected:
 *   - Event flags (bosses, graces, cookbooks, bell bearings, whetblades):
 *     a big bitfield; each item's ID is a bit position.
 *   - Inventory (weapons, armor, talismans, magic, etc.):
 *     item IDs found in the slot's inventory bytes.
 * ========================================================================== */


/* ------------------------------ GLOBAL STATE ------------------------------ */

// The <input type="file"> the user uploads their save through
const fileSelector = document.getElementById("savefile");

// Byte signatures used to find the start of the inventory inside a slot.
// `pattern` is the base-game marker; `pattern_dlc` is a shorter marker that
// DLC-era saves match instead.
const pattern = new Uint8Array([0xB0, 0xAD, 0x01, 0x00, 0x01, 0xFF, 0xFF, 0xFF]);
const pattern_dlc = new Uint8Array([0xB0, 0xAD, 0x01, 0x00, 0x01]);
let isDlcFile = false; // set to true in getInventory() if the DLC marker was used


let file_read = null; // the raw save file (ArrayBuffer)
let inventory = null;
// Output of the analysis. `counter` holds owned / not-owned / total tallies.
let result = { worked: false, owned: null, "not-owned": null, counter: null };

// These four are filled in by getJsonFiles():
var all_items = null;          // every known item, by category, keyed by ID
var item_counter = null;       // tally template (all zeros), incremented as items are classified
var item_dict_template = null; // empty result shape: { category: [] } or { category: { sub: [] } }
var eventflag_bst_map = null;  // lookup: event-flag block id -> block position (see processFlags)


/* ------------------------------ FILE UPLOAD ------------------------------- */

fileSelector.addEventListener("change", (event) => {
  // no file selected to read
  if (document.querySelector("#savefile").value == null) {
    alert("No file selected");
    return;
  }

  let file = document.querySelector("#savefile").files[0];

  let reader = new FileReader();
  reader.onload = function (e) {
    file_read = e.target.result;

    // Valid saves begin with the ASCII bytes "BND4" (66, 78, 68, 52)
    if (!buffer_equal(file_read["slice"](0, 4), new Int8Array([66, 78, 68, 52]))) {
      e.target.result = null;
      document.getElementById("slot_select").style.display = "none";getInventory
      alert("Insert a valid file");
      return;
    }

    // Fill the dropdown with the 10 character names
    updateSlotDropdown(getNames(file_read));

    // Once a slot is picked, reveal the option checkboxes and Calculate button
    $("#slot_selector").on("change", function (e) {
      $("#setting_buttons").css("display", "block")
      $("#calculate").css("display", "block")
    });
  };
  reader.onerror = function (e) {
    // error occurred
    console.log("Error : " + e.type);
  };
  reader.readAsArrayBuffer(file); // starts the read; reader.onload fires when done
});

// Runs when the user clicks Calculate.
function calculate() {
  let options = $("#slot_selector option:selected");
  let selected_slot = options[0].value; // slot index 0-9
  getJsonFiles();                                    // (re)load databases so each run starts fresh
  result = getOwnedAndNot(file_read, selected_slot); // parse the save and classify items
  if (result["worked"]) {
    // Load the HTML skeletons for the two result sections, then show the
    // collapse buttons and add "owned/total" counters to the headings.
    $("#owned").load("page_parts.html #owned_section", () => {
      $("#not-owned").load("page_parts.html #not-owned-section", () => {
        document.getElementById("collapse_button1").style.display = "block";
        document.getElementById("collapse_button2").style.display = "block";
        addFraction();
      });
    });
  }
}


/* ------------------------------ JSON LOADING ------------------------------ */

// Small wrapper around jQuery AJAX. `async: false` makes it blocking, so the
// data is ready before the next line runs. Simple, but it can briefly freeze
// the page. (Also why you need a local web server rather than file://.)
function fetchJson(url, callback) {
  $.ajax({
    url: url,
    async: false,
    dataType: "json",
    success: callback,
  });
}

// Builds the global `all_items` database from several JSON files.
function getJsonFiles() {
  // Base game: armament, armor, ashesOfWar, magic, spiritAshes, talisman
  fetchJson("assets/json/all_items.json", function (data) {
    all_items = { ...data };

    // Optional extras, toggled by checkboxes in the UI
    if ($("#altered-armor").is(":checked")) {
      fetchJson("assets/json/altered_armor.json", function (data2) {
        all_items.armor = { ...all_items.armor, ...data2 }; // merge into armor
      });
    }

    if ($("#unobtainable-items").is(":checked")) {
      fetchJson("assets/json/unobtainable.json", function (data2) {
        all_items.armor = { ...all_items.armor, ...data2.armor };
        all_items.talisman = { ...all_items.talisman, ...data2.talisman };
      });
    }

    // Categories that live in their own files
    // Load bosses.json
    fetchJson("assets/json/bosses.json", function (data) {
      all_items.bosses = { ...data.bosses };
    });
    fetchJson("assets/json/graces.json", function (data) {
      all_items.graces = { ...data.graces };
    });
    fetchJson("assets/json/cookbooks.json", function (data) {
      all_items.cookbooks = { ...data.cookbooks };
    });
    fetchJson("assets/json/bell_bearings.json", function (data) {
      all_items.bell_bearings = { ...data.bell_bearings };
    });
    fetchJson("assets/json/whetblades.json", function (data) {
      all_items.whetblades = { ...data.whetblades };
    });
    fetchJson("assets/json/tools.json", function (data) {
      all_items.tools = { ...data.tools };
    });
    fetchJson("assets/json/gestures.json", function (data) {
      all_items.gestures = { ...data.gestures };
    });
    fetchJson("assets/json/crystal_tears.json", function (data) {
      all_items.crystal_tears = { ...data.crystal_tears };
    });

    // Shadow of the Erdtree DLC: merge its items into every matching category
    if ($("#dlc-items").is(":checked")) {
      fetchJson("assets/json/dlc_items.json", function (data2) {
        all_items.armament = { ...all_items.armament, ...data2.armament };
        all_items.armor = { ...all_items.armor, ...data2.armor };
        all_items.talisman = { ...all_items.talisman, ...data2.talisman };
        all_items.ashesOfWar = { ...all_items.ashesOfWar, ...data2.ashesOfWar };
        all_items.magic = { ...all_items.magic, ...data2.magic };
        all_items.spiritAshes = { ...all_items.spiritAshes, ...data2.spiritAshes };
        all_items.bosses = { ...all_items.bosses, ...data2.bosses };
        all_items.graces = { ...all_items.graces, ...data2.graces };
        all_items.cookbooks = { ...all_items.cookbooks, ...data2.cookbooks };
        all_items.bell_bearings = { ...all_items.bell_bearings, ...data2.bell_bearings };
        all_items.whetblades = { ...all_items.whetblades, ...data2.whetblades };
        all_items.tools = { ...all_items.tools, ...data2.tools };
        all_items.gestures = { ...all_items.gestures, ...data2.gestures };
        all_items.crystal_tears = { ...all_items.crystal_tears, ...data2.crystal_tears };
      });
    }
  });


  // Empty shape for the owned / not-owned results
  fetchJson("assets/json/item_dict_template.json", function (data) {
    item_dict_template = { ...data };
  });

  // Zeroed counters (reloaded each run so counts don't accumulate)
  fetchJson("assets/json/item_counter.json", function (data) {
    item_counter = { ...data };
  });


  // Maps an event-flag "block id" to where that block sits in the flag array
  fetchJson("assets/json/eventflag_bst.json", function (data) {
    eventflag_bst_map = { ...data };
  });

}


/* --------------------------- SAVE FILE PARSING ---------------------------- */

// The save holds 10 character slots at fixed byte ranges. Returns each as a
// Uint8Array view (subarray shares memory, nothing is copied).
// Each range is [start, end]; the "+ 1" makes the end inclusive.
function get_slot_ls(dat) {
  let slot1 = dat.subarray(0x00000310, 0x0028030f + 1);
  let slot2 = dat.subarray(0x00280320, 0x050031f + 1);
  let slot3 = dat.subarray(0x500330, 0x78032f + 1);
  let slot4 = dat.subarray(0x780340, 0xa0033f + 1);
  let slot5 = dat.subarray(0xa00350, 0xc8034f + 1);
  let slot6 = dat.subarray(0xc80360, 0xf0035f + 1);
  let slot7 = dat.subarray(0xf00370, 0x118036f + 1);
  let slot8 = dat.subarray(0x1180380, 0x140037f + 1);
  let slot9 = dat.subarray(0x1400390, 0x168038f + 1);
  let slot10 = dat.subarray(0x16803a0, 0x190039f + 1);
  return [slot1, slot2, slot3, slot4, slot5, slot6, slot7, slot8, slot9, slot10];
}

// Returns the index of the first occurrence of `pattern` inside `mylist`,
// or undefined if it isn't found.
function subfinder(mylist, pattern) {
  for (let i = 0; i < mylist.byteLength; i++) {
    // Cheap first-byte check before comparing the whole pattern
    if (mylist[i] === pattern[0] && buffer_equal(mylist.subarray(i, i + pattern.byteLength), pattern)) return i;
  }
}

// True if two buffers contain exactly the same bytes.
function buffer_equal(buf1, buf2) {
  if (buf1.byteLength !== buf2.byteLength) return false;
  let dv1 = new Int8Array(buf1);
  let dv2 = new Int8Array(buf2);
  for (let i = 0; i !== buf1.byteLength; i++) {
    if (dv1[i] !== dv2[i]) return false;
  }
  return true;
}

// Cuts the raw inventory bytes out of a slot.
// (`index` and `index1` have no let/const, so they become globals.)
function getInventory(slot) {
  // Try the base-game marker first. If subfinder() found nothing it returns
  // undefined, undefined + number = NaN, and `!NaN` is true, so we fall back
  // to the DLC marker and remember that this is a DLC-format save.
  index = subfinder(slot, pattern) + pattern.byteLength + 8
  if (!index) {
    index = subfinder(slot, pattern_dlc) + pattern_dlc.byteLength + 3
    isDlcFile = true
  }
  // The inventory ends at the first run of 50 zero bytes after the start
  index1 = subfinder(slot.subarray(index, slot.byteLength), new Uint8Array(50).fill(0)) + index + 6;
  return slot.subarray(index, index1);
}

// Finds the event-flag bitfield (records things like "boss defeated" or
// "grace unlocked"). The save is a sequence of structs with no table of
// contents, so this adds up the size of each one, in order, until it reaches
// the flags. Each numbered step skips one struct. Sizes are in bytes.
// `true` in the DataView calls means little-endian.
function getEventFlags(slot) {
  let offset = 0;
  const view = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);

  // 1. ver (u32) + map_id (4) + _0x18 (0x18)
  offset += 4 + 4 + 0x18; // 32

  // 2. ga_items: 0x1400 items, variable size each
  //    Every entry starts with 8 bytes; weapons add 13 more and armor adds 8,
  //    which is why the size must be worked out per item. The type is the
  //    top nibble of the item id.
  for (let i = 0; i < 0x1400; i++) {
    let item_id = view.getUint32(offset + 4, true);
    offset += 8; // gaitem_handle + item_id
    if (item_id !== 0 && (item_id & 0xf0000000) === 0) {
      offset += 13; // unk2(4) + unk3(4) + aow_gaitem_handle(4) + unk5(1)
    } else if (item_id !== 0 && (item_id & 0xf0000000) === 0x10000000) {
      offset += 8; // unk2(4) + unk3(4)
    }
  }

  // 3. PlayerGameData: 432 bytes
  offset += 432;

  // 4. _0xd0: 208 bytes
  offset += 0xd0;

  // 5. EquipData: 22 u32 fields = 88 bytes
  offset += 88;

  // 6. ChrAsm: 29 u32 fields = 116 bytes
  offset += 116;

  // 7. ChrAsm2: 22 u32 fields = 88 bytes
  offset += 88;

  // 8. EquipInventoryData(0xa80, 0x180):
  //    common_count(4) + 0xa80 items * 12 + key_count(4) + 0x180 items * 12 + next_equip(4) + next_acq(4)
  offset += 4 + (0xa80 * 12) + 4 + (0x180 * 12) + 4 + 4; // 37,520

  // 9. EquipMagicData: 0xC spells * 8 + _0x10(16) + active_slot(4) = 116
  offset += 116;

  // 10. EquipItemData: 0xA quick_slots * 8 + active_slot(4) + 0x6 pouch * 8 + _0x8(8) = 140
  offset += 140;

  // 11. equip_gesture_data: 6 * i32 = 24
  offset += 24;

  // 12. EquipProjectileData: count(4) + count * 8
  //     Variable length: the count is read from the file itself.
  let projectile_count = view.getInt32(offset, true);
  offset += 4 + projectile_count * 8;

  // 13. EquippedItems: 39 u32 fields = 156
  offset += 156;

  // 14. EquipPhysicsData: 2 u32 = 8
  offset += 8;

  // 15. _0x4: u32 = 4
  offset += 4;

  // 16. _face_data: 0x12f = 303
  offset += 0x12f;

  // 17. EquipInventoryData(0x780, 0x80):
  //    common_count(4) + 0x780 items * 12 + key_count(4) + 0x80 items * 12 + next_equip(4) + next_acq(4)
  //    (the storage box; same layout as step 8 but a different size)
  offset += 4 + (0x780 * 12) + 4 + (0x80 * 12) + 4 + 4; // 24,592

  // 18. gesture_game_data: 0x40 * i32 = 256
  offset += 256;

  // 19. Regions: count(4) + count * u32  (variable length, count from the file)
  let regions_count = view.getUint32(offset, true);
  offset += 4 + regions_count * 4;

  // 20. RideGameData: 3 floats(12) + i32(4) + _0x10(16) + u32(4) + u32(4) = 40
  offset += 40;

  // 21. _0x1(1) + _0x40(64) + _0x4_1(4) + _0x4_2(4) + _0x4_3(4) = 77
  offset += 77;

  // 22. _menu_profile_save_load: 0x1008 = 4104
  offset += 0x1008;

  // 23. _trophy_equip_data: 0x34 = 52
  offset += 0x34;

  // 24. GaItemData: distinct_count(4) + unk1(4) + 0x1b58 items * 16 = 112,008
  offset += 4 + 4 + (0x1b58 * 16);

  // 25. _tutorial_data: 0x408 = 1032
  offset += 0x408;

  // 26. _0x1d: 29
  offset += 0x1d;

  // 27. Return event_flags subarray (0x1bf99f bytes)
  return slot.subarray(offset, offset + 0x1bf99f);
}

// Splits an array into chunks of `chunk_size`
// e.g. split([1,2,3,4,5], 2) -> [[1,2],[3,4],[5]]
function split(list_a, chunk_size) {
  let splitted = [];
  for (let i = 0; i < list_a.length; i += chunk_size) {
    let chunk = list_a.slice(i, i + chunk_size);
    splitted.push(chunk);
  }
  return splitted;
}

// Turns one inventory entry into an item ID string. Takes the first 4 bytes,
// reverses them (the save stores numbers little-endian) and writes each as
// 2 hex digits, e.g. bytes [0x10,0x27,0x00,0x80] -> "80002710".
// (`tmp` has no let/const, so it is a global.)
function getIdReversed(id) {
  let final_id = "";
  tmp = id.slice(0, 4).reverse();
  for (let i = 0; i < 4; i++) {
    final_id += decimalToHex(tmp[i], 2);
  }
  return final_id;
}

// Number -> hex string, left-padded with zeros (default 2 digits): 5 -> "05"
function decimalToHex(d, padding) {
  let hex = Number(d).toString(16);
  padding = typeof padding === "undefined" || padding === null ? (padding = 2) : padding;

  while (hex.length < padding) {
    hex = "0" + hex;
  }
  return hex;
}

// How each inventory-based category is organised in all_items.
//   nested: true  -> items are grouped into sub-categories (e.g. weapon class)
//   subcatKey     -> the item field that holds the sub-category name
const inventoryCategories = {
  armament: { nested: true, subcatKey: "class" },
  armor: { nested: true, subcatKey: "category" },
  ashesOfWar: { nested: true, subcatKey: "category" },
  magic: { nested: true, subcatKey: "category" },
  spiritAshes: { nested: false },
  talisman: { nested: false },
  tools: { nested: false },
  gestures: { nested: false },
  crystal_tears: { nested: false }
};

// Pulls the two things we need out of the chosen slot:
//   event_flags - bitfield for bosses / graces / cookbooks / etc.
//   id_list     - hex ID of every inventory entry
function parseSlotData(file_read, selected_slot) {
  const saves_array = new Uint8Array(file_read);
  const slot = get_slot_ls(saves_array)[selected_slot];
  const inventory = Array.from(getInventory(slot));
  const event_flags = getEventFlags(slot);
  // Entries are 16 bytes (base game) or 8 bytes (DLC format). Chunk them,
  // then convert each chunk to an uppercase hex ID to match the JSON keys.
  const id_list = split(inventory, isDlcFile ? 8 : 16)
    .map((raw_id) => getIdReversed(raw_id).toUpperCase());
  return { event_flags, id_list };
}


/* --------------------- OWNED / NOT-OWNED CLASSIFICATION ------------------- */

// For flag-based categories. Each key in all_items[category] is an event-flag
// number; this checks the matching bit in the save to see if it's set.
//   isGrouped = true -> items are filed under a subcategory (used for graces)
function processFlags(category, event_flags, owned_items, not_owned_items, isGrouped = false) {
  if (!all_items[category]) return;
  Object.keys(all_items[category]).forEach((flag_id) => {
    const event_id = parseInt(flag_id);
    const block_id = Math.floor(event_id / 1000); // flags are stored in blocks of 1000

    // Look up where this block starts in the flag array
    const bst_val = eventflag_bst_map[block_id];
    if (bst_val === undefined) {
      console.warn(`Missing BST entry for block_id: ${block_id} (event_id: ${event_id})`);
      return;
    }

    // Byte position = block start (125 bytes per block) + byte within the block
    const block_offset = bst_val * 125 + Math.floor((event_id % 1000) / 8);
    // Bit position within that byte (counted from the high bit)
    const bit_index = 7 - (event_id % 8);

    const item = all_items[category][flag_id];
    const byte = event_flags[block_offset];

    // Bit set = the player has it
    const owned = (byte & (1 << bit_index)) !== 0;
    const target = owned ? owned_items : not_owned_items;

    if (isGrouped) {
      const sub = item.subcategory || "Other";
      if (!target[category][sub]) target[category][sub] = [];
      target[category][sub].push(item.name);
    } else {
      target[category].push(item.name);
    }

    // Update the tallies shown beside each heading (e.g. "12/40")
    if (owned) {
      item_counter[category]["summary"]["owned"]++;
    } else {
      item_counter[category]["summary"]["not-owned"]++;
    }
    item_counter[category]["summary"]["total"]++;
  });
}

// For inventory-based categories: every ID found in the save is "owned";
// whatever is left in all_items afterwards is "not owned".
function processInventoryItems(id_list, owned_items, not_owned_items) {
  // Pass 1: match each ID from the save against the item database
  id_list.forEach((id) => {
    for (const [category, config] of Object.entries(inventoryCategories)) {
      const categoryData = all_items[category];
      if (categoryData && id in categoryData) {
        const item = categoryData[id];
        if (config.nested) {
          const sub = item[config.subcatKey]; // e.g. "Katana" or "Head"
          owned_items[category][sub].push(item.name);
          item_counter[category][sub]["owned"]++;
          item_counter[category][sub]["total"]++;
        } else {
          owned_items[category].push(item.name);
        }
        item_counter[category]["summary"]["owned"]++;
        item_counter[category]["summary"]["total"]++;
        delete categoryData[id]; // remove it so pass 2 doesn't count it as missing
        break; // Found the category, move to next id
      }
    }
  });

  // Pass 2: anything still in all_items was never found in the save
  for (const [category, config] of Object.entries(inventoryCategories)) {
    const categoryData = all_items[category];
    if (!categoryData) continue;
    for (const id in categoryData) {
      const item = categoryData[id];
      if (config.nested) {
        const sub = item[config.subcatKey];
        not_owned_items[category][sub].push(item.name);
        item_counter[category][sub]["not-owned"]++;
        item_counter[category][sub]["total"]++;
      } else {
        not_owned_items[category].push(item.name);
      }
      item_counter[category]["summary"]["not-owned"]++;
      item_counter[category]["summary"]["total"]++;
    }
  }
}

// Main analysis. Returns { worked, owned, "not-owned", counter }.
// `worked: false` means something threw (corrupt or unsupported save).
function getOwnedAndNot(file_read, selected_slot) {
  try {
    const { event_flags, id_list } = parseSlotData(file_read, selected_slot);

    // Deep copies (JSON round-trip) so the template itself is never modified
    const owned_items = JSON.parse(JSON.stringify(item_dict_template));
    const not_owned_items = JSON.parse(JSON.stringify(item_dict_template));

    // Process event-flag based categories
    processFlags("bosses", event_flags, owned_items, not_owned_items);
    processFlags("graces", event_flags, owned_items, not_owned_items, true); // grouped by region
    processFlags("cookbooks", event_flags, owned_items, not_owned_items);
    processFlags("bell_bearings", event_flags, owned_items, not_owned_items);
    processFlags("whetblades", event_flags, owned_items, not_owned_items);

    // Process inventory-based categories
    processInventoryItems(id_list, owned_items, not_owned_items);

    return { worked: true, owned: owned_items, "not-owned": not_owned_items, counter: item_counter };
  } catch (err) {
    console.error(err);
    return { worked: false, owned: null, "not-owned": null, counter: null };
  }
}


/* ------------------------- CHARACTER NAME DROPDOWN ------------------------ */

// Reads the 10 character names from fixed offsets in the file. Names are
// stored as 16-bit characters (32 bytes), hence the Uint16Array.
function getNames(file_read) {
  let decoder = new TextDecoder("utf-8");
  let name1 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x1901d0e, 0x1901d0e + 32)))));
  let name2 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x1901f5a, 0x1901f5a + 32)))));
  let name3 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x19021a6, 0x19021a6 + 32)))));
  let name4 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x19023f2, 0x19023f2 + 32)))));
  let name5 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x190263e, 0x190263e + 32)))));
  let name6 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x190288a, 0x190288a + 32)))));
  let name7 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x1902ad6, 0x1902ad6 + 32)))));
  let name8 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x1902d22, 0x1902d22 + 32)))));
  let name9 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x1902f6e, 0x1902f6e + 32)))));
  let name10 = decoder.decode(new Int8Array(Array.from(new Uint16Array(file_read.slice(0x19031ba, 0x19031ba + 32)))));

  let names = [name1, name2, name3, name4, name5, name6, name7, name8, name9, name10];
  // Strip the null characters left over from fixed-width name fields
  names.forEach((name, index) => {
    names[index] = name.replaceAll("\x00", "");
  });
  return names;
}

// Rebuilds the slot <select>. Empty slots (no name) are shown as a disabled " - ".
function updateSlotDropdown(slot_name_list) {
  let select = document.getElementById("slot_select");
  select.innerHTML = `<i class="icofont-rounded-right"></i> <strong>Select slot: </strong>
        <select class="form-select" aria-label="Select slot" id="slot_selector">
         <option hidden selected>Select the slot whose inventory you want to analyze</option>`;
  let selector = select.getElementsByTagName("select")[0];
  for (let i = 0; i < 10; i++) {
    if (slot_name_list[i] === "") {
      selector.innerHTML += `<option value="${i}" disabled> - </option>`;
    } else {
      selector.innerHTML += `<option value="${i}"> ${slot_name_list[i]} </option>`;
    }
  }
  select.style.display = "block";
}


/* -------------------------------- RENDERING ------------------------------- */

// Converts an item name into a wiki URL slug.
//   stripUpgrade = true : drop a trailing " +N" upgrade level ("Dagger +10" -> "Dagger")
//   stripUpgrade = false: keep it but remove the space before "+" (used for talismans)
function normalizeWikiName(itemName, stripUpgrade = true) {
  let normalized = itemName;
  if (stripUpgrade) {
    normalized = normalized.replace(/ \+\d+$/, ""); // Remove "+10", "+25", etc.
  } else {
    normalized = normalized.replace(/ \+/g, "+"); // Remove space before "+" (e.g. " +3" -> "+3")
  }
  normalized = normalized.replace(/\[(\d+)\]/g, "($1)"); // "[2]" -> "(2)"
  normalized = normalized.replace(/ /g, "+");            // spaces -> "+" for the URL
  return normalized;
}

// Decides which wiki page a card links to and which CSS class it gets.
function getCardMetadata(itemName, categoryName) {
  const BASE_URL = "https://eldenring.wiki.fextralife.com";

  let cardClass = "card";
  let url = "";

  // Handle category-specific URL and styling logic
  switch (categoryName) {
    case "gestures":
      // Gestures all link to one shared page
      url = `${BASE_URL}/Gestures`;
      break;

    case "graces":
      // Graces link to the general Sites of Grace page and get special styling
      cardClass += " grace-card";
      url = `${BASE_URL}/Sites+of+Grace`;
      break;

    case "bosses": {
      cardClass += " grace-card";
      // Remove a trailing "(location)" so the link points to the boss itself
      const baseBossName = normalizeWikiName(itemName.replace(/\s*\(.*\)\s*$/, "").trim());
      url = `${BASE_URL}/${baseBossName}`;
      break;
    }

    default: {
      // Everything else links to its own page (talismans keep their "+N")
      const normalizedName = normalizeWikiName(itemName, categoryName !== "talisman");
      url = `${BASE_URL}/${normalizedName}`;
      break;
    }
  }

  return { url, cardClass };
}

// Builds the <img> for an item card. Images are lazy-loaded: `src` is a small
// placeholder GIF and the real image path sits in `data-src` until the card
// scrolls into view (handled by the jQuery Lazy plugin in getCategorySection).
function createImageHtml(itemName, categoryName) {
  const skipImageCategories = ["graces", "bosses"]; // these have no images
  if (skipImageCategories.includes(categoryName)) {
    return "";
  }

  // Strip invalid file name characters
  const cleanImgName = itemName.replace(/[:?"*|<>\\/]+/g, "");

  return `
    <img alt="${itemName} img" class="lazy item-img card-img"
         src="https://acegif.com/wp-content/uploads/loading-25.gif"
         data-src="./assets/img/${categoryName}/${cleanImgName}.webp"
         title="${itemName}">
    <br>`.trim();
}

// Builds one item card: a Bootstrap column containing the image, the name and
// a link to the wiki (the link covers the whole card via "stretched-link").
function getCard(itemName, categoryName = "") {
  const { url, cardClass } = getCardMetadata(itemName, categoryName);
  const imgHtml = createImageHtml(itemName, categoryName);

  return `
    <div class="col-6 col-sm-4 col-md-3 col-lg-2 col-xl-2">
      <div class="${cardClass}" title="${itemName}">
        ${imgHtml}
        <p class="card-text">${itemName}</p>
        <a href="${url}" class="stretched-link" target="_blank"></a>
      </div>
    </div>`.trim();
}

// Fills one category container (e.g. #owned-armor) with cards.
// `owned` is the string "owned" or "not-owned".
function getCategorySection(category, owned) {
  const containerId = owned === "owned" ? `owned-${category}` : `not-owned-${category}`;
  const category_container = document.getElementById(containerId);
  const categoryData = result?.[owned]?.[category];

  // Do nothing if there's no container, no data, or it's already rendered
  if (!category_container || !categoryData || category_container.innerHTML !== "") {
    return;
  }

  // Alphabetical; numeric-aware so "Cookbook [2]" sorts before "Cookbook [10]"
  const sortItems = (items) => {
    return [...items].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };

  // Renders a flat list of items as one row of cards
  const renderRow = (items) => {
    const row = document.createElement("div");
    row.className = "row-flex";
    sortItems(items).forEach((item) => {
      row.innerHTML += getCard(item, category);
    });
    category_container.appendChild(row);
  };

  if (!Array.isArray(categoryData)) {
    // Nested data ({ subcategory: [items] }): a heading plus a row per subcategory
    Object.entries(categoryData).forEach(([type, items]) => {
      let counterStr = "";
      if (item_counter?.[category]?.[type]) {
        // "owned/total" text floated to the right of the heading
        counterStr = `<span style="float: right">${item_counter[category][type][owned]}/${item_counter[category][type]["total"]}</span>`;
      }
      category_container.insertAdjacentHTML("beforeend", `<h4>${type}${counterStr}</h4>`);
      renderRow(items);
    });
  } else {
    // Flat list of items
    renderRow(categoryData);
  }

  // Start lazy-loading the images that were just added
  $(function () {
    $("img.lazy").Lazy({
      // your configuration goes here
      scrollDirection: "vertical",
      effect: "fadeIn",
      visibleOnly: true, // only load images that are currently on screen
      onError: function (element) {
        console.log("error loading " + element.data("src"));
      },
    });
  });
}

// Adds an "owned/total" counter to each category's main <h3> heading.
function addFraction() {
  item_counter = result["counter"];
  ["owned", "not-owned"].forEach((owned) => {
    for (let item_type in item_counter) {
      $(`#${owned}-${item_type}`)
        .prev()   // the heading bar just before the category container
        .find("h3")
        .append(`<span style="float: right">${item_counter[item_type]["summary"][owned]}/${item_counter[item_type]["summary"]["total"]}</span>`);
    }
  });
}

// Formats big numbers compactly: 1500 -> "1.5k", 2000000 -> "2M".
function nFormatter(num, digits) {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" }
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/; // trims trailing zeros ("1.50" -> "1.5")
  // Pick the biggest unit that fits (search from largest to smallest)
  var item = lookup.slice().reverse().find(function (item) {
    return num >= item.value;
  });
  return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
}
