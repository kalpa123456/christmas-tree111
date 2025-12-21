import React, { useState, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { 
  OrbitControls, 
  Float, 
  PerspectiveCamera, 
  Text, 
  Html,
  Points,
  PointMaterial,
  Image as DreiImage
} from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { random } from 'maath' //

// --- 配置参数 (基于 README) ---
const CONFIG = {
  counts: {
    foliage: 15000,   // 降低到 15000 以保证性能
    ornaments: 11,    // 对应 1.jpg 到 11.jpg
    lights: 300
  },
  tree: { height: 22, radius: 9 },
  colors: {
    tree: '#0a4d1c',
    light: '#ffdd88',
    star: '#ffcc00'
  }
}

// --- 核心逻辑：粒子与坐标生成 ---
const generateTreePositions = (count: number, isDispersed: boolean) => {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    if (isDispersed) {
      // 散开形态：球体分布
      const r = 20 + Math.random() * 20
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
    } else {
      // 聚合形态：圆锥体分布 (圣诞树)
      // 使用 LaTeX 描述坐标映射：
      // $y = h \cdot \text{rand}$, $r = R \cdot (1 - y/h)$
      const y = Math.random() * CONFIG.tree.height
      const r = (1 - y / CONFIG.tree.height) * CONFIG.tree.radius
      const angle = Math.random() * Math.PI * 2
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = y - CONFIG.tree.height / 2
      positions[i * 3 + 2] = Math.sin(angle) * r
    }
  }
  return positions
}

// --- 圣诞树粒子组件 ---
function TreeParticles({ isDispersed }: { isDispersed: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const targetPositions = useMemo(() => generateTreePositions(CONFIG.counts.foliage, isDispersed), [isDispersed])
  
  useFrame((state, delta) => {
    if (!ref.current) return
    const current = ref.current.geometry.attributes.position.array as Float32Array
    // 缓动平滑过渡
    for (let i = 0; i < current.length; i++) {
      current[i] = THREE.MathUtils.lerp(current[i], targetPositions[i], delta * 2)
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.rotation.y += delta * 0.1 // 缓慢自转
  })

  return (
    <Points ref={ref} positions={new Float32Array(CONFIG.counts.foliage * 3)} stride={3}>
      <PointMaterial transparent color={CONFIG.colors.tree} size={0.08} sizeAttenuation={true} depthWrite={false} />
    </Points>
  )
}

// --- 拍立得照片组件 ---
function PhotoOrnaments({ isDispersed }: { isDispersed: boolean }) {
  const photos = Array.from({ length: CONFIG.counts.ornaments }, (_, i) => `/photos/${i + 1}.jpg`)
  
  return (
    <group>
      {photos.map((url, idx) => (
        <Float key={idx} speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <DreiImage 
            url={url} 
            position={[
              (Math.random() - 0.5) * 15, 
              (Math.random() - 0.5) * 20, 
              (Math.random() - 0.5) * 15
            ]} 
            scale={1.5}
          />
        </Float>
      ))}
    </group>
  )
}

// --- 主应用组件 ---
export default function App() {
  const [isDispersed, setIsDispersed] = useState(false)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050505' }}>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 5, 30]} fov={45} />
        
        {/* 鼠标控制 */}
        <OrbitControls 
          enablePan={false} 
          minDistance={10} 
          maxDistance={50} 
          autoRotate={!isDispersed}
          autoRotateSpeed={0.5}
        />

        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color={CONFIG.colors.light} />

        <TreeParticles isDispersed={isDispersed} />
        <PhotoOrnaments isDispersed={isDispersed} />

        {/* 后期处理：辉光效果 */}
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.4} />
        </EffectComposer>
      </Canvas>

      {/* 交互 UI 按钮 */}
      <div style={{ position: 'absolute', bottom: '50px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <h1 style={{ color: 'white', marginBottom: '20px', fontFamily: 'serif', letterSpacing: '2px' }}>
          🎄 Luxury Christmas Gallery
        </h1>
        <button 
          onClick={() => setIsDispersed(!isDispersed)}
          style={{
            padding: '15px 40px',
            fontSize: '18px',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '50px',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s'
          }}
        >
          {isDispersed ? "✨ 聚合圣诞树 (Assemble)" : "💥 散开记忆 (Disperse)"}
        </button>
      </div>
    </div>
  )
}