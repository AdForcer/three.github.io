import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
//import { TextGeometry } from 'three/addons/geometires/TextGeometry.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.1, 1000 );

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

let loader = new GLTFLoader();

// Загрузка GLB файла
loader.load(
    '../3DModels/3dScene.glb',
    function (gltf) {
        scene.add(gltf.scene);
        console.log(gltf.scene);
        
        if (gltf.animations && gltf.animations.length) {
        }
    },
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (error) {
        console.error('Error loading GLB model:', error);
    }
);

function createSkyboxEquirectangular() {
    const loader = new THREE.TextureLoader();
    loader.load('../textures/SkyBox.jpg', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });
}




class CRTFilter {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.time = 0;
        
        this.init();
    }
    
    init() {
        // Сцена для пост-обработки
        this.postScene = new THREE.Scene();
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        this.rt = new THREE.WebGLRenderTarget(
            window.innerWidth, 
            window.innerHeight, 
            { 
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            }
        );
        
        this.crtMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: this.rt.texture },
                time: { value: 0 },
                distortion: { value: 0.15 },
                curvature: { value: 0.05 },
                scanlines: { value: 600.0 },
                scanlineIntensity: { value: 0.15 },
                vignetting: { value: 0.4 },
                chromaAberration: { value: 0.01 },
                edgeWarp: { value: 0.2 },
                screenCurvature: { value: 0.1 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                uniform float distortion;
                uniform float curvature;
                uniform float scanlines;
                uniform float scanlineIntensity;
                uniform float vignetting;
                uniform float chromaAberration;
                uniform float edgeWarp;
                uniform float screenCurvature;
                uniform vec2 resolution;
                varying vec2 vUv;
                
                vec2 barrelDistortion(vec2 coord) {
                    vec2 cc = coord - 0.5;
                    float dist = dot(cc, cc);
                    return coord + cc * (distortion * dist);
                }
                
                // Функция для warping edges (искривление краев)
                vec2 edgeWarpDistortion(vec2 uv) {
                    vec2 center = uv - 0.5;
                    
                    // Сильное искривление по краям
                    float dist = length(center);
                    float factor = 1.0 + edgeWarp * dist * dist;
                    
                    return center * factor + 0.5;
                }
                
                // Функция для закругленных углов
                float roundedRectMask(vec2 uv, vec2 size, float radius) {
                    vec2 position = abs(uv - 0.5) * size;
                    float distance = length(max(position - size + radius, 0.0));
                    return smoothstep(radius, radius - 0.01, distance);
                }
                
                void main() {
                    // Искривление краев
                    vec2 distortedUV = edgeWarpDistortion(vUv);
                    
                    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }
                    
                    vec2 finalUV = barrelDistortion(distortedUV);
                    
                    //Хроматическая аберрация
                    float r = texture2D(tDiffuse, finalUV).r;
                    float g = texture2D(tDiffuse, finalUV).g;
                    float b = texture2D(tDiffuse, finalUV).b;
                    float edgeFactor = length(vUv - 0.5) * 5.0;
                    if (edgeFactor > 0.3) {
                        float aberrationStrength = chromaAberration * edgeFactor * edgeFactor * 2.0;
                        r = texture2D(tDiffuse, finalUV + vec2(aberrationStrength * 1.5, 0.0)).r;
                        g = texture2D(tDiffuse, finalUV + vec2(aberrationStrength * 0.5, 0.0)).g;
                        b = texture2D(tDiffuse, finalUV - vec2(aberrationStrength * 1.5, 0.0)).b;
                    }
                    
                    // Сканлайны
                    float scanline = sin(finalUV.y * scanlines + time * 3.0) * scanlineIntensity;
                    
                    // Виньетирование
                    vec2 vigUV = finalUV - 0.5;
                    float vignette = 1.0 - dot(vigUV, vigUV) * vignetting;
                    
                    // Маска с закругленными углами
                    float cornerMask = roundedRectMask(finalUV, vec2(1.0), 0.05);
                    
                    vec3 color = vec3(r, g, b);
                    color *= (1.0 - scanline * 0.5);
                    color *= vignette;
                    color *= cornerMask;
                    
                    // Дополнительное затемнение по краям
                    float edgeDarken = 1.0 - smoothstep(0.6, 1.2, length(vigUV * 2.0)) * 0.4;
                    color *= edgeDarken;
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });
        
        const plane = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(plane, this.crtMaterial);
        this.postScene.add(this.quad);
    }
    
    render() {
        this.time += 0.016;
        this.crtMaterial.uniforms.time.value = this.time;
        
        this.renderer.setRenderTarget(this.rt);
        this.renderer.render(this.scene, this.camera);
        
        // Рендер пост-обработки на экран
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postScene, this.orthoCamera);
    }
    
    onWindowResize() {
        this.rt.setSize(window.innerWidth, window.innerHeight);
        this.crtMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
}

const crtFilter = new CRTFilter(renderer, scene, camera);


// Камерные дела всякие!
camera.position.x = -200;
camera.position.y = 50;
camera.rotation.y -= 1.6;

class CameraAnimation {
    constructor(camera) {
        this.camera = camera;
        this.curve = null;
        this.progress = 0;
        this.speed = 0.002;
        this.isAnimating = false;
        this.hasCompleted = false;
        
        this.setupAnimationCurve();
    }
    
    setupAnimationCurve() {

        const points = [
            new THREE.Vector3(-200, 50, 0),
            new THREE.Vector3(-20, 57, 4),
            new THREE.Vector3(-5, 56.6, 4),
        ];
        
        this.curve = new THREE.CatmullRomCurve3(points);
        this.curve.closed = false;
    }
    
    startAnimation() {
        if (this.hasCompleted) {
            console.log('Анимация уже завершена');
            return;
        }
        this.isAnimating = true;
        this.progress = 0;
        console.log('Запуск анимации камеры');
    }
    
    update() {
        if (!this.isAnimating || this.hasCompleted) return;
        
        const cameraPosition = this.curve.getPoint(this.progress);
        this.camera.position.copy(cameraPosition);
        
        const lookAheadProgress = Math.min(this.progress + 0.01, 1);
        const lookAhead = this.curve.getPoint(lookAheadProgress);
        this.camera.lookAt(lookAhead);
        
        this.progress += this.speed;
        
        // Проверяем завершение анимации
        if (this.progress >= 1) {
            this.progress = 1;
            this.isAnimating = false;
            this.hasCompleted = true;
            
            const finalPosition = this.curve.getPoint(1);
            this.camera.position.copy(finalPosition);
            
            console.log('Анимация камеры завершена');
        }
    }
    
    // Метод для перезапуска анимации
    restartAnimation() {
        this.hasCompleted = false;
        this.isAnimating = false;
        this.progress = 0;
        this.startAnimation();
    }
    
    // Метод для проверки статуса анимации
    getAnimationStatus() {
        return {
            isAnimating: this.isAnimating,
            hasCompleted: this.hasCompleted,
            progress: Math.round(this.progress * 100) + '%'
        };
    }
}

const cameraAnimation = new CameraAnimation(camera);

let clock = new THREE.Clock();

function animate() {
    // Используем CRT фильтр для рендеринга
    crtFilter.render();
    const deltaTime = clock.getDelta();
    // Обновляем анимацию камеры
    cameraAnimation.update(deltaTime);
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // Обновляем CRT фильтр при изменении размера окна
    crtFilter.onWindowResize();
}

// Кнопочки
const buttonGeometry = new THREE.BoxGeometry(1,1,1);
const buttonMaterial = new THREE.MeshBasicMaterial({color:0x00883fff});
const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
buttonMesh.position.set(-190, 50, 0);
scene.add(buttonMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onClick(event) {
    // Обновляем координаты мыши при клике (на всякий случай)
    onMouseMove(event);
    
    // Обновляем матрицы мира всех объектов сцены
    scene.traverse(object => {
        if (object.isMesh) {
            object.updateMatrixWorld(true);
        }
    });
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([buttonMesh]);
    
    if (intersects.length > 0) {
        console.log('Button clicked!');
        cameraAnimation.startAnimation();
    }
}

createSkyboxEquirectangular();
window.addEventListener('resize', onWindowResize, false);
window.addEventListener('mousemove', onMouseMove, false);
window.addEventListener('click', onClick, false);
renderer.setAnimationLoop(animate);