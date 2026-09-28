// Source: pinned OrcaSlicer 8500fcd, GCodeProcessor.cpp 3830–3947 and
// libvgcode PathVertex.hpp 129. This annotates an existing preview; it never
// changes its geometry, layer interpretation, E accounting, or time estimates.
const f = Math.fround;
const positive = value => Number.isFinite(value) && value > 0;
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const empty = reason => ({ height: null, width: null, flow: null, mm3PerMm: null, reason });

/** Native double position/delta arithmetic with float stored attributes. Exact float operations for known linear commanded extrusion inputs. */
export function nativeLinearFlow({ delta, diameter, feedrate }) {
  if (!Array.isArray(delta) || delta.length !== 4 || !delta.every(Number.isFinite) || !positive(diameter) || !Number.isFinite(feedrate) || feedrate < 0) return null;
  const [x,y,z,e] = delta, radius = f(f(diameter) * 0.5);
  if (e <= 0 || (x === 0 && y === 0)) return null;
  const length = f(Math.sqrt(x*x + y*y + z*z));
  const area = f(f(Math.PI) * f(radius*radius));
  const volume = f(area*e), mm3PerMm = f(volume/length);
  // GCodeReader exposes float words; process_G1 promotes F to double before
  // multiplication by its float 1/60 constant, then stores a float feedrate.
  const speed = f(f(feedrate) * f(1/60)), flow = f(speed*mm3PerMm);
  return [length,area,volume,mm3PerMm,speed,flow].every(Number.isFinite) && length > 0 ? { flow, mm3PerMm } : null;
}

function diametersFromSource(lines) {
  let header = null, config = null, hasConfig = false;
  for (const line of lines) {
    const match = line.match(/^\s*;\s*filament_diameter\s*([:=])\s*(.*?)\s*$/);
    if (!match) continue;
    const parts = match[2].split(',').map(value => value.trim());
    const values = parts.length <= 256 && parts.every(value => numeric.test(value) && positive(f(Number(value)))) ? parts.map(value => f(Number(value))) : null;
    if (match[1] === '=') { config = values; hasConfig = true; } else header = values;
  }
  return (hasConfig ? config : header) || [];
}

/** Keep independent float-word/native-position state for scalar values.
 * Unknown geometry, arcs, volumetric-E and firmware macro effects remain
 * unavailable. Tagged dimensions remain useful even when flow is unavailable.
 */
export function derivePreviewAttributes(parsed) {
  if (!parsed || !Array.isArray(parsed.segments)) throw new TypeError('Parsed G-code is required');
  const lines = parsed.source?.lines;
  if (!Array.isArray(lines)) return { segments: parsed.segments.map(() => empty('Source text is unavailable')), diameters: [], warnings: ['Source text is unavailable'] };
  const diameters = diametersFromSource(lines), warnings = new Set();
  const attributes = [], positions = [null,null,null,0], origins = [0,0,0,0];
  let relative = false, relativeE = false, units = 1, feedrate = null, filament = 0, height = null, width = null, wiping = false, volumetric = false, unknownE = false, unknownFilament = false, nextSegment = 0;
  for (let lineIndex = 0; lineIndex < lines.length && nextSegment < parsed.segments.length; lineIndex++) {
    const raw = lines[lineIndex], semicolon = raw.indexOf(';');
    const comment = semicolon < 0 ? '' : raw.slice(semicolon+1).trim();
    const tag = comment.match(/^(HEIGHT|WIDTH):\s*(.*)$/);
    if (tag) {
      const value = numeric.test(tag[2]) ? f(Number(tag[2])) : null;
      if (!positive(value)) warnings.add(`Invalid or non-positive ${tag[1]} metadata; affected dimensions are unavailable`);
      if (tag[1] === 'HEIGHT') height = positive(value) ? value : null;
      else width = positive(value) ? value : null;
    }
    if (comment === 'WIPE_START') wiping = true;
    if (comment === 'WIPE_END') wiping = false;
    const code = (semicolon < 0 ? raw : raw.slice(0,semicolon)).replace(/\([^)]*\)/g,'').replace(/\*.*$/,'').trim().toUpperCase();
    const tokens = [...code.matchAll(/([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g)].filter(token => token[1] !== 'N');
    const lead = tokens[0], command = lead ? lead[1]+Number(lead[2]) : '';
    const words = new Map(tokens.slice(1).map(token => [token[1],f(Number(token[2]))]));
    let delta = null;
    if (command === 'G90') relative = false;
    else if (command === 'G91') relative = true;
    else if (command === 'M82') relativeE = false;
    else if (command === 'M83') relativeE = true;
    else if (command === 'G20') units = f(25.4);
    else if (command === 'G21') units = 1;
    else if (command === 'M200' && words.has('D')) volumetric = words.get('D') !== 0;
    else if (command === 'G10' || command === 'G11') unknownE = true;
    else if (command === 'M1020') { unknownFilament = true; warnings.add('M1020 filament mapping requires native processing'); }
    else if (/^T\d+$/.test(command)) {
      const next = Number(command.slice(1));
      if (next < diameters.length && next < 255) { filament = next; unknownFilament = false; }
      else warnings.add('Tool command is outside the known filament metadata; native processing is required');
    } else if (command === 'G92') {
      for (let axis=0;axis<4;axis++) if (words.has('XYZE'[axis])) {
        const value = f(words.get('XYZE'[axis])*units);
        if (axis === 3) { positions[3]=value; unknownE=false; }
        else if (Number.isFinite(positions[axis])) origins[axis] = positions[axis]-value;
        else { positions[axis]=value; origins[axis]=0; }
      }
    } else if (command === 'G28') {
      const named = ['X','Y','Z'].filter(axis => new RegExp(`\\b${axis}(?:\\s|[-+\\d.]|$)`).test(code));
      for (let axis=0;axis<3;axis++) if (!named.length || named.includes('XYZ'[axis])) positions[axis]=null;
    } else if (/^G[0-3]$/.test(command)) {
      if (words.has('F')) feedrate=words.get('F');
      const target=positions.map((value,axis)=>words.has('XYZE'[axis]) ? (relative || (axis===3 && relativeE) ? Number.isFinite(value) ? value+words.get('XYZE'[axis])*units : null : origins[axis]+words.get('XYZE'[axis])*units) : value);
      if (positions.every(Number.isFinite) && target.every(Number.isFinite)) delta=target.map((value,axis)=>value-positions[axis]);
      for(let axis=0;axis<4;axis++)positions[axis]=target[axis];
    }
    while (nextSegment < parsed.segments.length && parsed.segments[nextSegment].line === lineIndex+1) {
      const segment = parsed.segments[nextSegment];
      let values=empty(null);
      if (segment.kind !== 'extrusion') values.reason='Not an extrusion path';
      else if (wiping) values.reason='Wipe moves require native event interpretation';
      else if (delta && delta[0]===0 && delta[1]===0) values.reason='Native classifies a Z-only E move as travel';
      else {
        values.height=height;
        values.width=positive(width) && (width <= 2 || positive(height)) ? f(Math.min(width,Math.max(2,f(4*(height||0))))) : null;
        const reason = segment.arc ? 'Native arc subdivision is required for flow' : volumetric ? 'Volumetric E mode requires native processing' : unknownE || unknownFilament ? 'Firmware or filament command effects require native processing' : relative && !relativeE ? 'G91 with absolute E differs from the existing geometry interpreter' : !diameters.length ? 'Filament diameter is absent from G-code metadata' : !delta ? 'Native linear motion inputs are unknown' : !Number.isFinite(feedrate) ? 'Feed rate is unknown' : null;
        const computed = reason ? null : nativeLinearFlow({delta,diameter:diameters[filament],feedrate});
        if (computed) Object.assign(values,computed);
        else values.reason=reason || 'Native flow inputs are invalid or outside float range';
      }
      attributes.push(values);nextSegment++;
    }
  }
  while(attributes.length<parsed.segments.length)attributes.push(empty('Source line is outside the retained preview text'));
  return {segments:attributes,diameters,warnings:[...warnings]};
}
