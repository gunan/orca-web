import {Font,Glyph,Path} from 'opentype.js/dist/opentype.mjs';
import {parseTextFont} from '../../shared/text-geometry.js';
export function testFont(){
  const outline=new Path();outline.moveTo(0,0);outline.lineTo(0,800);outline.lineTo(600,800);outline.lineTo(600,0);outline.close();outline.moveTo(100,100);outline.lineTo(500,100);outline.lineTo(500,700);outline.lineTo(100,700);outline.close();
  const font=new Font({familyName:'Test Ring',styleName:'Regular',unitsPerEm:1000,ascender:800,descender:-200,glyphs:[new Glyph({name:'.notdef',advanceWidth:700,path:new Path()}),new Glyph({name:'space',unicode:32,advanceWidth:300,path:new Path()}),new Glyph({name:'O',unicode:79,advanceWidth:700,path:outline})]});return parseTextFont(font.toArrayBuffer());
}
