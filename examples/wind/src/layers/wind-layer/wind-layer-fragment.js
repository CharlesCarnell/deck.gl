// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

export default `\
#define SHADER_NAME wind-layer-fragment-shader

#ifdef GL_ES
precision highp float;
#endif

#define NUM_OF_LIGHTS 2

varying vec4 vPosition;
varying vec4 vNormal;
varying vec4 vColor;
varying float vAltitude;

uniform vec3 cameraPos;
uniform vec3 lightsPosition;
uniform vec2 lightsStrength;
uniform float ambientRatio;
uniform float diffuseRatio;
uniform float specularRatio;

const float TILE_SIZE = 512.0;
const float PI = 3.1415926536;
const float WORLD_SCALE = TILE_SIZE / (PI * 2.0);

const float PROJECT_LINEAR = 0.;
const float PROJECT_MERCATOR = 1.;
const float PROJECT_MERCATOR_OFFSETS = 2.;

uniform float projectionMode;
uniform float projectionScale;
uniform vec4 projectionCenter;
uniform vec3 projectionPixelsPerUnit;
uniform mat4 projectionMatrix;

// TODO: this should get added by assembleShaders, verify and remove (other layers too).
#ifdef INTEL_TAN_WORKAROUND

// All these functions are for substituting tan() function from Intel GPU only
const float TWO_PI = 6.2831854820251465;
const float PI_2 = 1.5707963705062866;
const float PI_16 = 0.1963495463132858;

const float SIN_TABLE_0 = 0.19509032368659973;
const float SIN_TABLE_1 = 0.3826834261417389;
const float SIN_TABLE_2 = 0.5555702447891235;
const float SIN_TABLE_3 = 0.7071067690849304;

const float COS_TABLE_0 = 0.9807852506637573;
const float COS_TABLE_1 = 0.9238795042037964;
const float COS_TABLE_2 = 0.8314695954322815;
const float COS_TABLE_3 = 0.7071067690849304;

const float INVERSE_FACTORIAL_3 = 1.666666716337204e-01; // 1/3!
const float INVERSE_FACTORIAL_5 = 8.333333767950535e-03; // 1/5!
const float INVERSE_FACTORIAL_7 = 1.9841270113829523e-04; // 1/7!
const float INVERSE_FACTORIAL_9 = 2.75573188446287533e-06; // 1/9!

float sin_taylor_fp32(float a) {
  float r, s, t, x;

  if (a == 0.0) {
    return 0.0;
  }

  x = -a * a;
  s = a;
  r = a;

  r = r * x;
  t = r * INVERSE_FACTORIAL_3;
  s = s + t;

  r = r * x;
  t = r * INVERSE_FACTORIAL_5;
  s = s + t;

  r = r * x;
  t = r * INVERSE_FACTORIAL_7;
  s = s + t;

  r = r * x;
  t = r * INVERSE_FACTORIAL_9;
  s = s + t;

  return s;
}

void sincos_taylor_fp32(float a, out float sin_t, out float cos_t) {
  if (a == 0.0) {
    sin_t = 0.0;
    cos_t = 1.0;
  }
  sin_t = sin_taylor_fp32(a);
  cos_t = sqrt(1.0 - sin_t * sin_t);
}

float tan_fp32(float a) {
    float sin_a;
    float cos_a;

    if (a == 0.0) {
        return 0.0;
    }

    // 2pi range reduction
    float z = floor(a / TWO_PI);
    float r = a - TWO_PI * z;

    float t;
    float q = floor(r / PI_2 + 0.5);
    int j = int(q);

    if (j < -2 || j > 2) {
        return 0.0 / 0.0;
    }

    t = r - PI_2 * q;

    q = floor(t / PI_16 + 0.5);
    int k = int(q);
    int abs_k = int(abs(float(k)));

    if (abs_k > 4) {
        return 0.0 / 0.0;
    } else {
        t = t - PI_16 * q;
    }

    float u = 0.0;
    float v = 0.0;

    float sin_t, cos_t;
    float s, c;
    sincos_taylor_fp32(t, sin_t, cos_t);

    if (k == 0) {
        s = sin_t;
        c = cos_t;
    } else {
        if (abs(float(abs_k) - 1.0) < 0.5) {
            u = COS_TABLE_0;
            v = SIN_TABLE_0;
        } else if (abs(float(abs_k) - 2.0) < 0.5) {
            u = COS_TABLE_1;
            v = SIN_TABLE_1;
        } else if (abs(float(abs_k) - 3.0) < 0.5) {
            u = COS_TABLE_2;
            v = SIN_TABLE_2;
        } else if (abs(float(abs_k) - 4.0) < 0.5) {
            u = COS_TABLE_3;
            v = SIN_TABLE_3;
        }
        if (k > 0) {
            s = u * sin_t + v * cos_t;
            c = u * cos_t - v * sin_t;
        } else {
            s = u * sin_t - v * cos_t;
            c = u * cos_t + v * sin_t;
        }
    }

    if (j == 0) {
        sin_a = s;
        cos_a = c;
    } else if (j == 1) {
        sin_a = c;
        cos_a = -s;
    } else if (j == -1) {
        sin_a = -c;
        cos_a = s;
    } else {
        sin_a = -s;
        cos_a = -c;
    }
    return sin_a / cos_a;
}
#endif

//
// Scaling offsets
//

float project_scale(float meters) {
  return meters * projectionPixelsPerUnit.x;
}

vec2 project_scale(vec2 meters) {
  return vec2(
    meters.x * projectionPixelsPerUnit.x,
    meters.y * projectionPixelsPerUnit.x
  );
}

vec3 project_scale(vec3 meters) {
  return vec3(
    meters.x * projectionPixelsPerUnit.x,
    meters.y * projectionPixelsPerUnit.x,
    meters.z * projectionPixelsPerUnit.x
  );
}

vec4 project_scale(vec4 meters) {
  return vec4(
    meters.x * projectionPixelsPerUnit.x,
    meters.y * projectionPixelsPerUnit.x,
    meters.z * projectionPixelsPerUnit.x,
    meters.w
  );
}

//
// Projecting positions
//

// non-linear projection: lnglats => unit tile [0-1, 0-1]
vec2 project_mercator_(vec2 lnglat) {
  return vec2(
    radians(lnglat.x) + PI,
#ifdef INTEL_TAN_WORKAROUND
        PI - log(tan_fp32(PI * 0.25 + radians(lnglat.y) * 0.5))
#else
        PI - log(tan(PI * 0.25 + radians(lnglat.y) * 0.5))
#endif
  );
}

vec2 project_position(vec2 position) {
  if (projectionMode == PROJECT_LINEAR) {
    return (position + vec2(TILE_SIZE / 2.0)) * projectionScale;
  }
  if (projectionMode == PROJECT_MERCATOR_OFFSETS) {
    return project_scale(position);
  }
  // Covers projectionMode == PROJECT_MERCATOR
  return project_mercator_(position) * WORLD_SCALE * projectionScale;
}

vec3 project_position(vec3 position) {
  return vec3(project_position(position.xy), project_scale(position.z) + .1);
}

vec4 project_position(vec4 position) {
  return vec4(project_position(position.xyz), position.w);
}

//

vec4 project_to_clipspace(vec4 position) {
  if (projectionMode == PROJECT_MERCATOR_OFFSETS) {
    return projectionMatrix * vec4(position.xyz, 0.0) + projectionCenter;
  }
  return projectionMatrix * position;
}

// Backwards compatibility

float scale(float position) {
  return project_scale(position);
}

vec2 scale(vec2 position) {
  return project_scale(position);
}

vec3 scale(vec3 position) {
  return project_scale(position);
}

vec4 scale(vec4 position) {
  return project_scale(position);
}

vec2 preproject(vec2 position) {
  return project_position(position);
}

vec3 preproject(vec3 position) {
  return project_position(position);
}

vec4 preproject(vec4 position) {
  return project_position(position);
}

vec4 project(vec4 position) {
  return project_to_clipspace(position);
}

float getLightWeight(vec4 position_worldspace, vec3 normals_worldspace) {
  float lightWeight = 0.0;

  vec3 position_worldspace_vec3 = position_worldspace.xyz / position_worldspace.w;
  vec3 normals_worldspace_vec3 = normals_worldspace.xzy;

  vec3 camera_pos_worldspace = cameraPos;
  vec3 view_direction = normalize(camera_pos_worldspace - position_worldspace_vec3);

  vec3 light_position_worldspace = project_position(lightsPosition);
  vec3 light_direction = normalize(light_position_worldspace - position_worldspace_vec3);

  vec3 halfway_direction = normalize(light_direction + view_direction);
  float lambertian = dot(light_direction, normals_worldspace_vec3);
  float specular = 0.0;
  if (lambertian > 0.0) {
    float specular_angle = max(dot(normals_worldspace_vec3, halfway_direction), 0.0);
    specular = pow(specular_angle, 32.0);
  }
  lambertian = max(lambertian, 0.0);
  lightWeight +=
    (ambientRatio + lambertian * diffuseRatio + specular * specularRatio) *
    lightsStrength.x;

  return lightWeight;
}

void main(void) {
  if (vColor.a == 0.) {
    discard;
  }
  // TODO: this is not needed since we should remove vAltitude,
  // but commenting this out renders wind outside of us too. (check boundingBox prop.)
  // if (vAltitude < -90.) {
  //   discard;
  // }
  float lightWeight = getLightWeight(vPosition, vNormal.xyz);
  gl_FragColor = vec4(vColor.xyz * lightWeight, 1);
}
`;
