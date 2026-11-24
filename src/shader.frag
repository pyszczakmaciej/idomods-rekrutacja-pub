// Sekcja CTA: miękkie, jedwabiste fałdy światła (czerń -> żółć).
// Pętla bez szwu: ruch zależy tylko od cos/sin(u_phase), gdzie u_phase = 2π·t/T,
// a pasma przesuwają się o dokładnie jedną długość fali na cykl, więc klatka t = T jest identyczna z t = 0.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_phase;
uniform vec3 u_dark;
uniform vec3 u_light;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Value noise 3D z interpolacją quintic (gładkie pochodne, brak "kanciastych" przejść).
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

// Tylko 2 oktawy: projekt nie ma drobnych detali, same łagodne gradienty.
float fbm(vec3 p) {
  return 0.65 * noise(p) + 0.35 * noise(p * 2.03 + vec3(7.1, 3.3, 1.7));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res; // (0,0) = lewy dolny róg
  vec2 p = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);

  // Okrąg w przestrzeni szumu: punkt próbkowania wraca do startu po pełnym cyklu.
  vec2 c = vec2(cos(u_phase), sin(u_phase));
  vec3 o = vec3(c.x, c.y, c.x - c.y) * 0.6;

  // Niskoczęstotliwościowy warp: fałdy delikatnie się wyginają i falują.
  float w1 = fbm(vec3(p * 0.6, 0.0) + o);
  float w2 = fbm(vec3(p * 0.6 + vec2(3.1, 7.4), 5.0) + o.zxy);
  vec2 pw = p + vec2(w1 - 0.5, w2 - 0.5) * 0.7;

  // Ukośne fałdy "\". Skośna fala: światło narasta łagodnie od lewej-góry,
  // a od prawego-dołu fałd kończy się ostrzejszym cieniem (jak w projekcie).
  // +u_phase przesuwa fałdy w lewo-dół o jedną długość fali na cykl.
  float d = dot(pw, normalize(vec2(0.65, 1.0)));
  float x = d * 5.5 + u_phase;
  float wave = 0.5 + 0.5 * sin(x - 0.75 * sin(x));
  float ridge = wave * wave;

  // Światło od dołu: górna ~1/3 sekcji pozostaje ciemna (miejsce na tekst).
  float m = 1.0 - smoothstep(0.0, 0.95, uv.y + (w1 - 0.5) * 0.4 - (uv.x - 0.5) * 0.25 - 0.04);

  // Jasność zmienia się wzdłuż fałdu, więc pasma nie są jednolite.
  float along = fbm(vec3(p * 1.4 + vec2(11.0, 2.0), 9.0) + o.yxz);

  float k = pow(m, 1.4) * (0.28 + 0.85 * ridge * (0.5 + 0.75 * along));
  k = clamp(k, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);

  vec3 col = mix(u_dark, u_light, k);

  // Dithering przeciw bandingowi w ciemnych gradientach.
  col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
