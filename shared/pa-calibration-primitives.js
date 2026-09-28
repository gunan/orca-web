// Geometry follows CalibPressureAdvance in pinned OrcaSlicer 2.4.2 calib.cpp.
// Keep movement ordering: native retract/travel/unretract changes modal speed.
export function paNumber(value,precision=5){const digits=precision?(value>=1000?precision:precision-1):6;if(value===0)return'0';const rounded=Number(value.toPrecision(digits)),exponent=Math.floor(Math.log10(Math.abs(rounded)));if(exponent<-4||exponent>=digits){const [mantissa,power]=rounded.toExponential(digits-1).split('e');return mantissa.replace(/(?:\.0*|(?:(\.[0-9]*?)0+))$/,'$1')+'e'+(Number(power)<0?'-':'+')+String(Math.abs(Number(power))).padStart(2,'0');}return rounded.toFixed(Math.max(0,digits-1-exponent)).replace(/(?:\.0*|(?:(\.[0-9]*?)0+))$/,'$1');}
export function paExtrusionPerMM(width,height,nozzle,diameter,ratio){
 const w=Math.fround(width),h=Math.fround(height),area=Math.fround(h*(w-h*(1-Math.PI/4)));
 return area*Math.fround(ratio)/(Math.PI*(Math.fround(diameter)/2)**2);
}
export function paCommand(flavor,value,isBambu=false){const v=String(Number(value.toPrecision(4)));if(isBambu)return`M900 K${v} L1000 M10`;if(flavor==='klipper')return`SET_PRESSURE_ADVANCE ADVANCE=${v}`;if(flavor==='reprapfirmware')return`M572 D0 S${v}`;if(flavor==='repetier')return`M233 X${v} Y${v}`;return`M900 K${v}`;}
export class PAWriter {
 constructor(config){this.config=config;this.events=[];this.position=[0,0,0];this.e=0;this.retracted=0;this.extra=0;this.feed=3600;this.material=0;}
 push(event){if(this.events.length>=100000)throw new Error('PA calibration exceeds its generated command limit');this.events.push(event);}
 speed(value){if(!(value>0&&value<100000))throw new Error('PA calibration feedrate is out of the native writer range');this.feed=value;this.push({type:'speed',feed:value});}
 extrusion(delta){this.e=this.config.relative?delta:this.e+delta;return this.e;}
 retract(){const amount=Math.max(0,this.config.retractionLength-this.retracted);this.extra=this.config.restartExtra;if(amount>1e-7){this.retracted+=amount;this.feed=this.config.retractionSpeed*60;this.push({type:'retract',e:this.extrusion(-amount),delta:-amount,feed:this.feed});}}
 unretract(){const amount=this.retracted+this.extra;if(amount>1e-7){this.retracted=0;this.extra=0;this.feed=this.config.deretractionSpeed*60;this.push({type:'unretract',e:this.extrusion(amount),delta:amount,feed:this.feed});}}
 travelZ(z,comment=''){if(Math.abs(this.position[2]-z)<.0001)return;this.position[2]=z;this.feed=this.config.travelZSpeed*60;this.push({type:'travel',z,feed:this.feed,comment});}
 move(x,y,comment='',hop=0,height=-1){this.retract();if(hop>.0001&&height>=0)this.travelZ(hop,'z-hop');this.position[0]=x;this.position[1]=y;this.feed=this.config.travelSpeed*60;this.push({type:'travel',x,y,feed:this.feed,comment});if(hop>.0001&&height>=0)this.travelZ(height,'undo z-hop');this.unretract();}
 extrude(x,y,delta,comment='',width,height){const from=[...this.position];this.position[0]=x;this.position[1]=y;this.material+=delta;this.push({type:'extrude',x,y,z:this.position[2],from,e:this.extrusion(delta),delta,feed:this.feed,comment,width,height});}
 line(x,y,width,height,speed,comment=''){const e=paExtrusionPerMM(width,height,this.config.nozzle,this.config.filamentDiameter,this.config.filamentFlow)*Math.hypot(x-this.position[0],y-this.position[1]);this.speed(speed);this.extrude(x,y,e,comment,width,height);}
 resetE(){if(Math.abs(this.e)<1e-9)return;this.e=0;if(!this.config.relative)this.push({type:'resetE'});}
 acceleration(value){value=Math.trunc(value);if(this.config.maxAcceleration>0)value=Math.min(value,this.config.maxAcceleration);if(value===0||value===this.lastAcceleration)return;this.lastAcceleration=value;this.push({type:'acceleration',value});}
 pressure(value){this.push({type:'pa',value,command:paCommand(this.config.flavor,value,this.config.isBambu)});}
}
export function drawPADigit(writer,x,y,character,width,ePerMM,bottomToTop=false){
 const len=2,gap=width/2;let p0=[x,y],p1,p2,p3,p4,p5,half0,half4,gap03,gap23,dot;
 if(bottomToTop){p1=[x,y+len];p2=[x+len,y+len];p3=[x+len,y];p4=[x+2*len,y];p5=[x+2*len,y+len];half0=[x,y+len/2];half4=[x+2*len,y+len/2];gap03=[x+gap,y];gap23=[x+len,y+len+gap];dot=[x+2*len-len/2,y+len/2];}
 else{p1=[x+len,y];p2=[x+len,y-len];p3=[x,y-len];p4=[x,y-2*len];p5=[x+len,y-2*len];half0=[x+len/2,y];half4=[x+len/2,y-2*len];gap03=[x,y-gap];gap23=[x+len-gap,y-len];dot=[x+len/2,y-2*len+len/2];}
 const move=p=>writer.move(...p,`Glyph: ${character}`),draw=(p,multiplier=1)=>writer.extrude(...p,ePerMM*len*multiplier,'Glyph stroke',width,writer.config.layerHeight);
 switch(character){
 case'0':move(p0);draw(p1);draw(p5,2);draw(p4);draw(gap03,2);break;
 case'1':move(half0);draw(half4,2);break;
 case'2':move(p0);draw(p1);draw(p2);draw(p3);draw(p4);draw(p5);break;
 case'3':move(p0);draw(p1);draw(p5,2);draw(p4);move(gap23);draw(p3);break;
 case'4':move(p0);draw(p3);draw(p2);move(p1);draw(p5,2);break;
 case'5':move(p1);draw(p0);draw(p3);draw(p2);draw(p5);draw(p4);break;
 case'6':move(p1);draw(p0);draw(p4,2);draw(p5);draw(p2);draw(p3);break;
 case'7':move(p0);draw(p1);draw(p5,2);break;
 case'8':move(p2);draw(p3);draw(p4);draw(p5);draw(p1,2);draw(p0);draw(p3);break;
 case'9':move(p5);draw(p1,2);draw(p0);draw(p3);draw(p2);break;
 case'.':move(half4);draw(dot);break;
 default:throw new Error('PA glyph formatting exceeds the supported native digits');
 }
}
export function drawPANumber(writer,x,y,value,width,ePerMM,speed,{bottomToTop=false,maxLength=5}={}){writer.speed(speed);const text=paNumber(value,maxLength).slice(0,maxLength);for(let i=0;i<text.length;i++)drawPADigit(writer,x+(bottomToTop?0:i*3),y+(bottomToTop?i*3:0),text[i],width,ePerMM,bottomToTop);}
export function drawPABox(writer,minX,minY,sizeX,sizeY,{perimeters,height,width,speed,filled=false}){
 let x=minX,y=minY;const maxX=minX+sizeX,maxY=minY+sizeY,spacing=width-height*(1-Math.PI/4),sin=Math.sin(Math.PI/4),step=spacing/sin;
 if(!(spacing>0))throw new Error('PA line width must exceed its rounded layer-height term');
 perimeters=Math.min(perimeters,Math.trunc(Math.min(Math.floor(sizeX*sin)/(spacing/sin),Math.floor(sizeY*sin)/(spacing/sin))));
 writer.move(x,y,'Move to box start');const line=(label)=>writer.line(x,y,width,height,speed,label);
 for(let i=0;i<perimeters;i++){if(i){x+=spacing;y+=spacing;writer.move(x,y,'Step inwards to print next perimeter');}y+=sizeY-i*spacing*2;line('Draw perimeter (up)');x+=sizeX-i*spacing*2;line('Draw perimeter (right)');y-=sizeY-i*spacing*2;line('Draw perimeter (down)');x-=sizeX-i*spacing*2;line('Draw perimeter (left)');}
 if(!filled)return;
 const modifier=spacing*(perimeters-1)+width*(1-1/3),left=minX+modifier,right=maxX-modifier,bottom=minY+modifier,top=maxY-modifier,nx=Math.floor((right-left)/step),ny=Math.floor((top-bottom)/step);
 let rx=(right-left)%step,ry=(top-bottom)%step;x=left;y=bottom;writer.move(x,y,'Move to fill start');
 for(let i=0;i<nx+ny+(rx+ry>=step?1:0);i++){
  if(i<Math.min(nx,ny)){if(i%2===0){x+=step;y=bottom;writer.move(x,y,'Fill: Step right');y+=x-left;x=left;line('Fill: Print up/left');}else{y+=step;x=left;writer.move(x,y,'Fill: Step up');x+=y-bottom;y=bottom;line('Fill: Print down/right');}}
  else if(i<Math.max(nx,ny)){
   if(nx>ny){if(i%2===0){x+=step;y=bottom;writer.move(x,y,'Fill: Step right');x-=top-bottom;y=top;line('Fill: Print up/left');}else{if(i===ny){x+=step-ry;ry=0;}else x+=step;y=top;writer.move(x,y,'Fill: Step right');x+=top-bottom;y=bottom;line('Fill: Print down/right');}}
   else if(i%2===0){x=right;if(i===nx){y+=step-rx;rx=0;}else y+=step;writer.move(x,y,'Fill: Step up');x=left;y+=right-left;line('Fill: Print up/left');}else{x=left;y+=step;writer.move(x,y,'Fill: Step up');x=right;y-=right-left;line('Fill: Print down/right');}
  }else if(i%2===0){x=right;y+=i===nx?step-rx:step;writer.move(x,y,'Fill: Step up');x-=top-y;y=top;line('Fill: Print up/left');}
  else{x+=i===ny?step-ry:step;y=top;writer.move(x,y,'Fill: Step right');y-=right-x;x=right;line('Fill: Print down/right');}
 }
}
