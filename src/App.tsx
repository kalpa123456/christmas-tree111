import React, { useState, useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Image as DreiImage, 
  Text, 
  Float,
  PointMaterial,
  Points,
  useCursor
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { easing } from 'maath'

// --- ⚙️ 配置中心 ---
const CONFIG = {
  counts: {
    foliage: 8000,    // 粒子数量
    ornaments: 11,    // 照片数量 (1.jpg - 31.jpg)
  },
  tree: { 
    height: 18, 
    radius: 7,
    color: '#0c5c28' 
  },
  text: {
    content: "MERRY\nCHRISTMAS",
    color: '#ffcc00',
    size: 2.5
  }
}

// --- 🌲 树/粒子组件 ---
function TreeParticles({ isDispersed, onClickTree }: { isDispersed: boolean, onClickTree: () => void }) {
  const ref = useRef<THREE.Points>(null)
  const { hovered, setHovered } = useCursorState()

  // 1. 生成两种状态的坐标：树形 (cone) 和 散开 (sphere)
  const [treePositions, dispersedPositions] = useMemo(() => {
    const tree = new Float32Array(CONFIG.counts.foliage * 3)
    const dispersed = new Float32Array(CONFIG.counts.foliage * 3)
    
    for (let i = 0; i < CONFIG.counts.foliage; i++) {
      // 树形坐标 (圆锥)
      const y = Math.random() * CONFIG.tree.height - CONFIG.tree.height / 2
      const r = (1 - (y + CONFIG.tree.height / 2) / CONFIG.tree.height) * CONFIG.tree.radius
      const angle = Math.random() * Math.PI * 2
      tree[i*3] = Math.cos(angle) * r
      tree[i*3+1] = y
      tree[i*3+2] = Math.sin(angle) * r

      // 散开坐标 (球体/星空)
      const r2 = 15 + Math.random() * 30
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      dispersed[i*3] = r2 * Math.sin(phi) * Math.cos(theta)
      dispersed[i*3+1] = r2 * Math.sin(phi) * Math.sin(theta)
      dispersed[i*3+2] = r2 * Math.cos(phi)
    }
    return [tree, dispersed]
  }, [])

  // 2. 动画帧：插值过渡
  useFrame((state, delta) => {
    if (!ref.current) return
    const positions = ref.current.geometry.attributes.position.array as Float32Array
    const target = isDispersed ? dispersedPositions : treePositions

    // 使用 maath 的 damp 进行平滑过渡 (0.25 是平滑系数)
    for (let i = 0; i < positions.length; i++) {
      positions[i] = THREE.MathUtils.lerp(positions[i], target[i], delta * 1.5)
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    
    // 旋转效果：散开时慢，聚合时稍快
    ref.current.rotation.y += delta * (isDispersed ? 0.05 : 0.1)
  })

  return (
    <Points 
      ref={ref} 
      positions={treePositions} 
      stride={3} 
      onClick={(e) => {
        e.stopPropagation()
        if (!isDispersed) onClickTree() // 点击树展开
      }}
      onPointerOver={() => !isDispersed && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <PointMaterial 
        transparent 
        color={CONFIG.tree.color} 
        size={0.12} 
        sizeAttenuation={true} 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </Points>
  )
}

// --- 🖼️ 单张交互照片组件 ---
function InteractablePhoto({ 
  url, 
  index, 
  isDispersed, 
  activeId, 
  setActiveId 
}: { 
  url: string, 
  index: number, 
  isDispersed: boolean, 
  activeId: number | null, 
  setActiveId: (id: number | null) => void 
}) {
  const ref = useRef<THREE.Group>(null)
  const isActive = activeId === index
  const isOtherActive = activeId !== null && activeId !== index
  const { setHovered } = useCursorState()

  // 随机生成的“散开位置”
  const targetPos = useMemo(() => {
    const r = 12 + Math.random() * 10
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    )
  }, [])

  // 树上的位置 (装饰品位置)
  const treePos = useMemo(() => {
    const y = (Math.random() * CONFIG.tree.height) - CONFIG.tree.height / 2
    const r = (1 - (y + CONFIG.tree.height / 2) / CONFIG.tree.height) * CONFIG.tree.radius + 0.5
    const angle = Math.random() * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r)
  }, [])

  useFrame((state, delta) => {
    if (!ref.current) return

    // 1. 计算目标位置
    let dest = isDispersed ? targetPos : treePos
    let destScale = isDispersed ? 1.5 : 0.8
    let destRot = new THREE.Euler(0, 0, 0)

    // 2. 如果被点击激活 (Zoom In)
    if (isActive) {
      // 移动到摄像机前方 (屏幕正中心)
      const cam = state.camera
      const camDir = new THREE.Vector3()
      cam.getWorldDirection(camDir)
      dest = cam.position.clone().add(camDir.multiplyScalar(8)) // 距离相机8个单位
      destScale = 4 // 放大
      destRot = state.camera.rotation // 面向相机
    } else if (isOtherActive) {
      destScale = 0 // 隐藏其他照片
    }

    // 3. 执行动画 (Damping)
    easing.damp3(ref.current.position, dest, 0.4, delta)
    easing.damp3(ref.current.scale, [destScale, destScale, 1], 0.3, delta)
    if (isActive) {
        easing.dampE(ref.current.rotation, destRot, 0.4, delta)
    } else {
        // 浮动旋转
        ref.current.rotation.y += delta * 0.2
    }
    
    // 始终朝向相机 (Billboard效果) - 仅在非激活且非树模式下
    if (!isActive && isDispersed) {
       ref.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={ref}>
      <DreiImage 
        url={url} 
        transparent 
        side={THREE.DoubleSide}
        onPointerOver={() => isDispersed && !activeId && setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          if (!isDispersed) return 
          // 只有在散开模式下可以点击放大
          setActiveId(isActive ? null : index)
        }}
      />
    </group>
  )
}

// --- ✨ 3D 文字组件 ---
function TitleText({ visible }: { visible: boolean }) {
  return (
    <group visible={visible}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <Text
          //font="/fonts/Cinzel-Bold.ttf" // 如果没有字体，Vite 会回退到默认，或者你可以删除font属性
          position={[0, CONFIG.tree.height / 2 + 2, 0]}
          fontSize={CONFIG.text.size}
          color={CONFIG.text.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#550000"
        >
          {CONFIG.text.content}
        </Text>
      </Float>
    </group>
  )
}

// --- 🖱️ 鼠标状态 Hook ---
function useCursorState() {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return { hovered, setHovered }
}

// --- 📱 UI 覆盖层 ---
function Overlay({ isDispersed, toggle, hasActivePhoto }: { isDispersed: boolean, toggle: () => void, hasActivePhoto: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      padding: '40px',
      display: 'flex',
      justifyContent: 'flex-end',
      pointerEvents: 'none' // 让鼠标能穿透 UI 点击 canvas
    }}>
      {/* 右下角控制按钮 */}
      {!hasActivePhoto && (
        <button
          onClick={toggle}
          style={{
            pointerEvents: 'auto',
            background: isDispersed ? 'rgba(255, 50, 50, 0.8)' : 'rgba(10, 150, 50, 0.8)',
            color: 'white',
            border: '2px solid rgba(255,255,255,0.5)',
            padding: '12px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            borderRadius: '50px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isDispersed ? "Close Gallery" : "Open Gift 🎁"}
        </button>
      )}
      
      {/* 提示文字 */}
      <div style={{
        position: 'absolute',
        top: '20px', left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.6)',
        fontSize: '14px',
        opacity: isDispersed && !hasActivePhoto ? 1 : 0,
        transition: 'opacity 0.5s'
      }}>
        Click a photo to zoom • Drag to rotate
      </div>
    </div>
  )
}

// --- 🚀 主入口 ---
export default function App() {
  const [isDispersed, setIsDispersed] = useState(false)
  const [activePhotoId, setActivePhotoId] = useState<number | null>(null)

  // 1.jpg 到 31.jpg
  const photos = useMemo(() => 
    Array.from({ length: CONFIG.counts.ornaments }, (_, i) => `/photos/${i + 1}.jpg`), 
  [])

  const handleToggle = () => {
    setIsDispersed(prev => !prev)
    setActivePhotoId(null) // 切换状态时重置照片放大
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020205', overflow: 'hidden' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 35], fov: 35 }}>
        {/* 场景环境 */}
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffddaa" />
        <fog attach="fog" args={['#020205', 20, 60]} />

        {/* 核心组件 */}
        <TreeParticles 
          isDispersed={isDispersed} 
          onClickTree={() => setIsDispersed(true)} 
        />
        
        {/* 照片群 */}
        {photos.map((url, i) => (
          <InteractablePhoto 
            key={i} 
            index={i} 
            url={url} 
            isDispersed={isDispersed}
            activeId={activePhotoId}
            setActiveId={setActivePhotoId}
          />
        ))}

        {/* 圣诞文字 (仅在聚合时显示) */}
        <TitleText visible={!isDispersed} />

        {/* 控制器 */}
        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          minDistance={10}
          maxDistance={50}
          autoRotate={!activePhotoId} // 没选中照片时自动旋转
          autoRotateSpeed={isDispersed ? 0.5 : 2.0} // 聚合时转快点，散开时慢点
          enabled={!activePhotoId} // 选中照片时禁用控制器，防止冲突
        />

        {/* 后期处理特效 */}
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.2} radius={0.5} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>

      <Overlay 
        isDispersed={isDispersed} 
        toggle={handleToggle} 
        hasActivePhoto={activePhotoId !== null}
      />
    </div>
  )
}