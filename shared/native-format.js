const buffer=new ArrayBuffer(8),view=new DataView(buffer),powers=new Map([[0,1n]]);
/** Native printf fixed decimals round the exact binary64 value to nearest/even.
 * Multiplying in Number first can invent half ties (0.005 * 100 === 0.5), so
 * retain the IEEE-754 significand/exponent until the final decimal rounding. */
export function nativeFixed(value,digits){
 if(!Number.isInteger(digits)||digits<0||digits>100)throw new RangeError('Invalid fixed decimal precision');
 if(!Number.isFinite(value))return String(value);
 view.setFloat64(0,value);const bits=view.getBigUint64(0),negative=Boolean(bits>>63n),exponent=Number(bits>>52n&2047n),fraction=bits&4503599627370495n,significand=exponent?fraction|4503599627370496n:fraction,power=exponent?exponent-1075:-1074;
 let scale=powers.get(digits);if(scale===undefined){scale=10n**BigInt(digits);powers.set(digits,scale);}
 const numerator=significand*scale*(power>0?1n<<BigInt(power):1n),denominator=power<0?1n<<BigInt(-power):1n;
 let rounded=numerator/denominator;const twice=numerator%denominator*2n;if(twice>denominator||(twice===denominator&&rounded%2n))rounded++;
 const text=rounded.toString().padStart(digits+1,'0'),result=digits?text.slice(0,-digits)+'.'+text.slice(-digits):text;return(negative?'-':'')+result;
}
