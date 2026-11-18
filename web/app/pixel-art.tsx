// Pixel sprites drawn as SVG rects (crisp at any size, no image files to load).
// Each sprite is a list of rows; every character is one pixel and maps to a colour in the palette ("." is empty).

type Palette = Record<string, string>;

function Sprite({rows, palette, size, className, label}:{rows:string[]; palette:Palette; size:number; className?:string; label?:string}){
  const w = rows[0].length, h = rows.length, rects: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    // Merge runs of the same colour into one rect to keep the DOM small.
    for (let x = 0; x < w;) {
      const c = row[x]; let end = x + 1;
      while (end < w && row[end] === c) end++;
      if (c !== "." && palette[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} fill={palette[c]}/>);
      x = end;
    }
  });
  return <svg className={className} viewBox={`0 0 ${w} ${h}`} width={size} height={size * h / w} shapeRendering="crispEdges"
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{rects}</svg>;
}

// The rabbit, after the user's pet: grey crown and back, white face and chest, a dark patch around its left eye,
// a white left ear and a grey right ear with a white tip, pink inner ears. Front view, so its left is the viewer's right.
const BUNNY = [
  ".......kkk....kkk.......",
  "......kwwwk..kwwwk......",
  "......kwwwk..kwpwk......",
  "......kgggk..kwpwk......",
  "......kgpgk..kwpwk......",
  "......kgpgk..kwpwk......",
  "......kgpgk..kwpwk......",
  "......kgggk..kwwwk......",
  "...kkkkgggkkkkwwwkkkk...",
  "...kggggggggggggggggk...",
  "..kggggggggggggggggggk..",
  "..kgggwwwwwwwwwwwdddgk..",
  "..kgwwehwwwwwwwdehddgk..",
  "..kgwweewwwwwwwdeedwgk..",
  "..kwwpwwwwwwnnwwwwwwpk..",
  "..kwwwwwwwkwwkwwwwwwwk..",
  "..kwwwwwwwwkkwwwwwwwwk..",
  "...kwwwwwwwwwwwwwwwwk...",
  "....kkwwwwwwwwwwwwkk....",
  "...kgggwwwwwwwwwwgggk...",
  "..kggggwwwwwwwwwwggggk..",
  "..kggggwwwwwwwwwwggggk..",
  "..kgggwwwkwwkwwwgggk....",
  "..kkkkkkkkkkkkkkkkkk....",
];
// Same sprite with the eyes shut, used for the blink frame.
const BUNNY_BLINK = BUNNY.map((row, y) =>
  y === 12 ? "..kgwwwwwwwwwwwdddddgk.." : y === 13 ? "..kgwkkwwwwwwwwdkkdwgk.." : row);
const BUNNY_COLOURS: Palette = {k:"var(--sprite-line)", g:"#8b919a", w:"#fff6ec", d:"#3c4448", e:"#1d2b53", h:"#ffffff", p:"#ffb3c6", n:"#ff77a8"};

export function Bunny({size = 96, mood = "idle"}:{size?:number; mood?:"idle"|"busy"|"happy"}){
  return <div className={`bunny bunny-${mood}`} style={{width:size, height:size}}>
    <Sprite className="bunny-open" rows={BUNNY} palette={BUNNY_COLOURS} size={size} label="像素兔子"/>
    <Sprite className="bunny-shut" rows={BUNNY_BLINK} palette={BUNNY_COLOURS} size={size}/>
  </div>;
}

// 8×8 icons for the status cards.
const ICONS: Record<string, string[]> = {
  bolt: ["....##..", "...##...", "..##....", ".######.", "....##..", "...##...", "..##....", ".##....."],
  zz: ["#####...", "...#....", "..#.....", ".#......", "#####...", ".....###", "......#.", ".....###"],
  rain: ["..####..", ".######.", "########", "########", "........", ".#..#..#", "#..#..#.", "........"],
  sword: [".......#", "......##", ".....##.", "#...##..", ".####...", "..##....", ".#.#....", "#......."],
  shuffle: [".....#..", "#######.", ".....#..", "........", "..#.....", ".#######", "..#.....", "........"],
  heart: [".##..##.", "########", "########", "########", ".######.", "..####..", "...##...", "........"],
};
export function Icon({name, colour, size = 20}:{name:keyof typeof ICONS|string; colour:string; size?:number}){
  return <Sprite rows={ICONS[name]} palette={{"#": colour}} size={size}/>;
}
