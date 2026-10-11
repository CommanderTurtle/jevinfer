import {test,expect} from 'bun:test';
import {canvasLayout,skinRegions,canvasBatches,selectedRegions,selectionCount,paintState,hexAt,applyPaintAnswer,outputSize} from '../src/paint-canvas.js';
import {pixelColor,palettes,surfacePixels} from '../src/paint.js';

test('Export dimensions fit the chosen long edge without stretching rectangular canvases',()=>{
  expect(outputSize(canvasLayout('custom',1024,1),4096)).toEqual({width:4096,height:4});
  expect(outputSize(canvasLayout('custom',8,16),512)).toEqual({width:256,height:512});
  expect(outputSize(canvasLayout('classic'),64)).toEqual({width:64,height:64});
});
test('Surface blending is reversible and preserves imported or KEEP pixels',()=>{
  const data=new Uint8ClampedArray([0,0,0,255,12,34,56,78]),palette={BLACK:'#000000',WHITE:'#ffffff'};
  const scores={0:{choice:'BLACK',probabilities:{BLACK:.75,WHITE:.25},palette},1:{choice:'KEEP',probabilities:{KEEP:1},palette}};
  expect([...surfacePixels(data,scores,true)]).toEqual([64,64,64,255,12,34,56,78]);
  expect([...surfacePixels(data,scores,false)]).toEqual([...data]);
  expect([...data]).toEqual([0,0,0,255,12,34,56,78]);
});

test('Classic and slim skin maps have 72 nonoverlapping faces within 64x64',()=>{
  for(const slim of [false,true]){const faces=skinRegions(slim),occupied=new Set();expect(faces.length).toBe(72);for(const r of faces)for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){expect(x>=0&&y>=0&&x<64&&y<64).toBe(true);expect(occupied.has(y*64+x)).toBe(false);occupied.add(y*64+x);}expect(occupied.size).toBe(slim?3136:3264);}
});
test('Skin region selection includes only the requested face or body part',()=>{
  const l=canvasLayout('classic');expect(selectionCount(l,'Head / Base / Front')).toBe(64);expect(selectionCount(l,'part:Head')).toBe(384);expect(selectionCount(l,'base')).toBe(1632);expect(selectionCount(l,'outer')).toBe(1632);
  const pixels=[...canvasBatches(l,'Head / Base / Front')].flat();expect(pixels[0]).toMatchObject({x:8,y:8,index:520});expect(pixels.at(-1)).toMatchObject({x:15,y:15,index:975});
  expect(selectedRegions(canvasLayout('slim'),'Right arm / Base / Front')[0].width).toBe(3);
});
test('Custom layouts validate dimensions and bounds; overlapping regions do not double-infer',()=>{
  expect(()=>canvasLayout('custom',0,8)).toThrow();expect(()=>canvasLayout('custom',1025,8)).toThrow();expect(()=>canvasLayout('custom',8,8,[{name:'bad',x:7,y:0,width:2,height:2}])).toThrow();
  const l=canvasLayout('custom',8,4,[{name:'a',x:0,y:0,width:4,height:4},{name:'b',x:2,y:0,width:4,height:4}]);expect(selectionCount(l,'all')).toBe(24);expect(selectionCount(l,'b')).toBe(16);
});
test('Inference state contains current RGBA pixels, neighbors and bounded face snapshots',()=>{
  const l=canvasLayout('classic'),data=new Uint8ClampedArray(64*64*4);data.set([255,32,64,255],520*4);const pixels=[...canvasBatches(l,'Head / Base / Front')][0],state=paintState(l,data,pixels,'Edit hair',palettes.skin);
  expect(state.pixels[0].current).toBe('#ff2040ff');expect(state.regions[0].current_rgba_rows.length).toBe(8);expect(state.regions[0].sample_step).toBe(1);expect(state.pixels[0].region).toBe('Head / Base / Front');
  const big=canvasLayout('custom',100,50),s=paintState(big,new Uint8ClampedArray(100*50*4),[...canvasBatches(big)][0],'x',palettes.mono);expect(s.regions[0].current_rgba_rows.length).toBeLessThanOrEqual(16);expect(s.regions[0].current_rgba_rows[0].length).toBeLessThanOrEqual(16);
});
test('KEEP preserves original pixels, CLEAR preserves transparency and edits are localized',()=>{
  const data=new Uint8ClampedArray([12,34,56,78,9,8,7,6]);applyPaintAnswer(data,0,{choice:'KEEP'},palettes.mono,pixelColor);expect([...data]).toEqual([12,34,56,78,9,8,7,6]);applyPaintAnswer(data,0,{choice:'INK'},palettes.mono,pixelColor);expect([...data]).toEqual([39,38,48,255,9,8,7,6]);applyPaintAnswer(data,0,{choice:'CLEAR'},palettes.mono,pixelColor);expect(hexAt(data,2,0,0)).toBe('#00000000');expect(hexAt(data,2,1,0)).toBe('#09080706');
});
