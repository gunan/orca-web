import React from 'react';
// GCodeViewer.cpp's active overview omits a ColorChange switch case. Preserve
// its native Unknown label instead of assigning semantics it does not display.
const names=['Unknown','Pause','Tool Change','Template','Custom','Unknown'];
export default function NativeCustomEvents({parsed}){
 const data=parsed.native?.data,mode=parsed.native?.modeIndex;
 if(data?.customEventOverviewVersion!==1||!data.customEventOverview.length)return null;
 return <section className="native-custom-events" aria-label="Native custom G-code overview"><h4>Custom G-code</h4><table><thead><tr><th>Type</th><th>Layer</th><th>Time</th></tr></thead><tbody>{data.customEventOverview.map((event,index)=><tr key={index} data-native-event={index} data-event-z={event.z}><td>{names[event.type]}</td><td>{event.layer}</td><td data-event-seconds={event.seconds[mode]}>{event.labels[mode]}</td></tr>)}</tbody></table></section>;
}
