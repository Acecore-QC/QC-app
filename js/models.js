// Drone models and the "Build info" sheet.
// To add a model: copy one of the entries in MODELS, give it a new key and adjust.
import { QC_SECTIONS, FINAL_ASSEMBLY } from './checklists.js';

// Checklist items that are linked to a photo type. The item shows a camera button
// and is marked "photo uploaded" automatically when a photo of that type exists.
export const PHOTO_LINKS = {
  'centerpiece_top.pictures_taken': 'top',
  'centerpiece_bottom.pictures_taken': 'bottom',
};

export const PHOTO_KINDS = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'other', label: 'Other' },
];

// Field helpers -------------------------------------------------------------
const f = (id, label, def = '', extra = {}) => ({ id, label, def, ...extra });
// A component with a model and a serial number (rendered on one row)
const comp = (id, label, model = 'x') => ({ id, label, pair: true, def: model });

function channels() {
  const names = ['Pitch', 'Roll', 'Throttle', 'YAW', 'Flight modes', 'x', 'Trigger picture', 'Killswitch'];
  const out = [];
  for (let i = 1; i <= 16; i++) out.push(f(`ch.${i}`, `CH${String(i).padStart(2, '0')}`, names[i - 1] || 'x'));
  return out;
}

function servos(motors) {
  const out = [];
  for (let i = 1; i <= 14; i++) out.push(f(`servo.${i}`, `Servo ${i}`, i <= motors ? `Motor ${i}` : 'x'));
  return out;
}

function buildInfo({ motors, hybrid }) {
  const groups = [
    { id: 'centerpiece', title: 'Centerpiece components', fields: [
      f('bec.model', 'Main BEC model', 'Airbot powerstick'),
      f('bec.v1', 'BEC voltage 1', '5,3V'),
      f('bec.v2', 'BEC voltage 2', '9V'),
      f('bec.v3', 'BEC voltage 3', '12V'),
      f('bec.v4', 'BEC voltage 4', '12V'),
      comp('esc', "ESC's", 'ACE T-Motor'),
      comp('gps1', 'GPS 1'),
      comp('gps2', 'GPS 2'),
      comp('fpv', 'FPV'),
      comp('lidar1', 'Lidar 1'),
      comp('lidar2', 'Lidar 2'),
      comp('datalink2', '2nd Datalink'),
    ]},
    { id: 'remote', title: 'Remote', fields: [
      comp('remote.ground', 'Ground unit', ''),
      comp('remote.air', 'Air unit', ''),
    ]},
    { id: 'fc', title: 'Flight computer', fields: [
      f('fc.model', 'Model', 'Cube orange plus'),
      f('fc.sn', 'Serial (SR)', '', { sn: true }),
      f('fc.firmware', 'Cube firmware', ''),
      f('fc.rc_in', 'RC_IN', ''),
      f('fc.sbus_out', 'Sbus out', 'x'),
      f('fc.telem1', 'Telem 1', ''),
      f('fc.telem2', 'Telem 2', 'x'),
      f('fc.serial3', 'Serial 3', 'x'),
      f('fc.serial4', 'Serial 4', 'x'),
      f('fc.can1', 'CAN 1', 'x'),
      f('fc.can2', 'CAN 2', 'x'),
      f('fc.i2c1', 'I2C-1', 'x'),
      f('fc.i2c2', 'I2C-2', 'x'),
    ]},
    { id: 'servos', title: 'Servo outputs', compact: true, fields: servos(motors) },
    { id: 'channels', title: 'RC channels', compact: true, fields: channels() },
    { id: 'carbon', title: 'Carbon', fields: [
      f('carbon.color', 'Color', ''),
      f('carbon.hood', 'Hood', 'Matte clearcoat'),
      f('carbon.booms', 'Booms', 'Matte clearcoat'),
    ]},
    { id: 'power', title: 'Power & LEDs', fields: [
      f('power.connectors', 'Power connectors', ''),
      f('power.extra_bec', "Extra BEC's", 'x'),
      f('power.external', 'External power', 'x'),
      f('led.config', 'LED config', 'GR RL WB'),
      f('led.switch', 'LED switch', '', { options: ['Yes', 'No'] }),
    ]},
  ];
  if (hybrid) {
    groups.push({ id: 'hybrid', title: 'Hybrid', fields: [
      f('hybrid.engine_sn', 'Engine SN', '', { sn: true }),
      f('hybrid.gcu_sn', 'GCU SN', '', { sn: true }),
      f('hybrid.cdi_sn', 'CDI SN', '', { sn: true }),
      f('hybrid.fuelpump_sn', 'Fuel pump SN', '', { sn: true }),
      f('hybrid.waterpump_sn', 'Water pump SN', '', { sn: true }),
      f('hybrid.supervisor_sn', 'Supervisor SN', '', { sn: true }),
    ]});
  }
  groups.push({ id: 'extras', title: 'Extras & notes', fields: [
    f('extra.1', 'Extra 1', ''), f('extra.2', 'Extra 2', ''), f('extra.3', 'Extra 3', ''),
    f('extra.4', 'Extra 4', ''), f('extra.5', 'Extra 5', ''),
    f('notes', 'Notes', '', { multiline: true }),
  ]});
  groups.push({ id: 'lemo', title: 'Lemo pinout (from inside perspective)', compact: true, fields: [
    f('lemo.1', 'Pin 1', 'Sbus -'), f('lemo.2', 'Pin 2', 'Telem -'), f('lemo.3', 'Pin 3', 'Servo -'),
    f('lemo.4', 'Pin 4', 'Servo s'), f('lemo.5', 'Pin 5', 'Telem RX'), f('lemo.6', 'Pin 6', 'Telem TX'),
    f('lemo.7', 'Pin 7', 'SBUS S'), f('lemo.8', 'Pin 8', '12v + (red)'), f('lemo.gnd', 'Ground', '12v – (ground wires)'),
  ]});
  return groups;
}

export const MODELS = {
  'noa-electric': {
    name: 'Noa Electric',
    buildInfo: buildInfo({ motors: 6, hybrid: false }),
    qcSections: QC_SECTIONS.filter(s => s.id !== 'hybrid_only'),
    finalAssembly: null,
  },
  'noa-hybrid': {
    name: 'Noa Hybrid',
    buildInfo: buildInfo({ motors: 8, hybrid: true }),
    qcSections: QC_SECTIONS,
    finalAssembly: FINAL_ASSEMBLY,
  },
};

// Header fields shared by all sheets
export const HEADER_FIELDS = [
  f('h.customer', 'Customer'),
  f('h.engineer', 'Name engineer'),
  f('h.supervisor', 'Name supervisor'),
  f('h.date_start', 'Date start', '', { date: true }),
  f('h.date_end', 'Date end', '', { date: true }),
];
