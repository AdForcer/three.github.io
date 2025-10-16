import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

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


camera.position.x = -200;
camera.position.y = 50;
camera.rotation.y -= 1.6;



function animate() {

  renderer.render( scene, camera );

  //camera.rotation.x += 0.009;
  //camera.rotation.y += 0.009;

}

function onWindowResize() {

    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

}
createSkyboxEquirectangular();

window.addEventListener('resize', onWindowResize, false);

renderer.setAnimationLoop(animate);
