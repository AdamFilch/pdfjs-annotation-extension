import './index.scss'; // 导入样式

import { Button, Modal, Popover } from 'antd'; // 导入 antd 组件
import Konva from 'konva'; // 导入 Konva 库
import React, { useCallback, useEffect, useRef, useState } from 'react'; // 导入 React 和相关 Hooks
import { useTranslation } from 'react-i18next';

import { PlusCircleOutlined } from '@ant-design/icons';

import { defaultOptions } from '../../const/default_options';
import { HASH_PARAMS_GET_URL, IAnnotationType } from '../../const/definitions'; // 导入自定义类型和默认设置
import { formatFileSize } from '../../utils/utils';

interface SignatureToolProps {
    annotation: IAnnotationType // 签名工具的注释类型
    onAdd: (signatureDataUrl: string) => void // 回调函数，当签名被添加时调用
    fileid?: string
}

const SignatureTool: React.FC<SignatureToolProps> = props => {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false) // 控制 Popover 的显示状态
    const [isModalOpen, setIsModalOpen] = useState(false) // 控制 Modal 的显示状态
    const [currentColor, setCurrentColor] = useState(defaultOptions.signature.COLORS[0]) // 当前选择的颜色
    const containerRef = useRef<HTMLDivElement | null>(null) // 引用签名容器的 DOM 节点
    const konvaStageRef = useRef<Konva.Stage | null>(null) // 引用 Konva.Stage 实例
    const colorRef = useRef(currentColor) // 用于追踪 currentColor 的最新值
    const [bgImage, setBgImage] = useState<Konva.Image | null>(null)

    const [isOKButtonDisabled, setIsOKButtonDisabled] = useState(true) // 初始状态下禁用 OK 按钮

    const [signatures, setSignatures] = useState<string[]>([]) // 存储所有签名的数组


    const { t } = useTranslation()

    useEffect(() => {
        try {
            const document_store = JSON.parse(localStorage.getItem(`document-viewer-ae-${props.fileid}`))
            const signature = document_store.find((annotation) => annotation.subtype == 'Caret')
            if (signature.contentsObj) {
                setSignatures([signature.contentsObj.image])
            }

        } catch (err) {
            setSignatures([])
        }

        // for (let i = 0; i < localStorage.length; i++) {
        //     const key = localStorage.key(i)
        //     if (key && key.startsWith('document-viewer-ae')) {
        //         current_document_store = JSON.parse(localStorage.getItem(key))
        //         const signature = current_document_store.find((annotation) => annotation.subtype == 'Caret')
        //         if (signature.contentsObj) {
        //             setSignatures([signature.contentsObj.image])
        //         }
        //         break
        //     }
        // }
    }, [])

    // 更新 colorRef 当 currentColor 改变时
    useEffect(() => {
        colorRef.current = currentColor
    }, [currentColor])

    // 处理 Popover 打开的状态变化
    const handleOpenChange = (newOpen: boolean) => {
        setIsPopoverOpen(newOpen)
    }

    // 处理签名的变化，将新的签名添加到签名列表中
    const handleSignaturesChange = (signature: string) => {
        setSignatures([...signatures, signature])
    }

    // 打开 Modal 窗口
    const openModal = () => {
        handleOpenChange(false)
        setIsModalOpen(true)
    }

    // 处理签名的添加
    const handleAdd = (signatureDataUrl: string) => {
        props.onAdd(signatureDataUrl)
        handleOpenChange(false)
    }

    // 点击确定按钮后的操作
    const handleOk = () => {
        // 获取当前绘制的签名数据 URL
        const signatureDataUrl = konvaStageRef.current?.toDataURL()
        setIsModalOpen(false)
        if (signatureDataUrl) {
            handleSignaturesChange(signatureDataUrl)
            props.onAdd(signatureDataUrl)
        }
    }

    // 点击取消按钮后的操作
    const handleCancel = () => {
        setIsModalOpen(false)
    }

    // 处理 Modal 打开后的操作
    const afterOpen = useCallback((open: boolean) => {
        if (!open && konvaStageRef.current) {
            // 如果 Modal 关闭且 Konva 实例存在，则销毁 Konva.Stage 实例
            konvaStageRef.current.destroy()
            konvaStageRef.current = null
            return
        }
        if (containerRef.current) {
            // 创建新的 Konva.Stage 实例并附加到容器中
            const stage = new Konva.Stage({
                container: containerRef.current, // 容器节点
                width: defaultOptions.signature.WIDTH, // 宽度
                height: defaultOptions.signature.HEIGHT // 高度
            })
            const layer = new Konva.Layer() // 创建新的图层
            stage.add(layer) // 将图层添加到舞台
            konvaStageRef.current = stage // 将实例引用保存到 konvaStageRef 中

            let isPainting = false // 标记当前是否正在绘制
            let lastLine: Konva.Line | null = null // 保存最后绘制的线条

            // 开始绘制的事件处理函数
            const startDrawing = () => {
                isPainting = true
                const pos = stage.getPointerPosition() // 获取当前指针位置
                if (!pos) return

                lastLine = new Konva.Line({
                    stroke: colorRef.current, // 使用最新的颜色
                    strokeWidth: props.annotation.style.strokeWidth || 3, // 线条宽度
                    globalCompositeOperation: 'source-over',
                    lineCap: 'round',
                    lineJoin: 'round',
                    points: [pos.x, pos.y] // 初始点
                })
                layer.add(lastLine) // 将线条添加到图层
            }

            // 停止绘制的事件处理函数
            const stopDrawing = () => {
                isPainting = false
                lastLine = null
            }

            // 绘制过程中的事件处理函数
            const draw = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
                if (!isPainting) return
                e.evt.preventDefault()

                const pos = stage.getPointerPosition() // 获取当前指针位置
                if (!pos || !lastLine) return

                // 添加新的点到当前线条
                const newPoints = lastLine.points().concat([pos.x, pos.y])
                lastLine.points(newPoints)
                setIsOKButtonDisabled(false) // 使 OK 按钮可用
            }

            // 添加 Konva.Stage 的事件监听
            stage.on('mousedown touchstart', startDrawing)
            stage.on('mouseup touchend', stopDrawing)
            stage.on('mousemove touchmove', draw)

            // 在组件卸载或状态变化时清理 Konva.Stage 的事件和实例
            return () => {
                stage.off('mousedown touchstart', startDrawing)
                stage.off('mouseup touchend', stopDrawing)
                stage.off('mousemove touchmove', draw)
                stage.destroy()
                konvaStageRef.current = null
            }
        }
    }, [])

    // 更新当前颜色的状态
    const changeColor = (color: string) => {
        setCurrentColor(color)
        // 获取所有的线条，并更新它们的颜色
        const allLine = konvaStageRef.current?.getLayers()[0].getChildren((node: Konva.Node) => node.getClassName() === 'Line') || []
        allLine.forEach((line: Konva.Line) => {
            line.stroke(color)
        })
    }

    const maxSize: number = defaultOptions.stamp.MAX_SIZE

    // 文件输入变化的事件处理函数
    const onInputFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const target = event.target as HTMLInputElement;
        const files = target.files;
        if (files?.length) {
            const _file = files[0];
            if (_file.size > maxSize) {
                alert(t('normal.fileSizeLimit', { value: formatFileSize(maxSize) }));
                return;
            }

            const reader = new FileReader();
            reader.onload = e => {
                if (typeof e.target?.result === 'string') {
                    const imageObj = new window.Image();
                    imageObj.src = e.target.result;
                    imageObj.onload = () => {
                        const stage = konvaStageRef.current;
                        if (!stage) return;

                        const canvasWidth = defaultOptions.signature.WIDTH;
                        const canvasHeight = defaultOptions.signature.HEIGHT;

                        const imageWidth = imageObj.width / 5;
                        const imageHeight = imageObj.height / 5;

                        // Calculate position to center the image
                        const x = (canvasWidth - imageWidth) / 2;
                        const y = (canvasHeight - imageHeight) / 2;


                        const bgImage = new Konva.Image({
                            image: imageObj,
                            x,
                            y,
                            width: imageWidth,
                            height: imageHeight,
                            listening: false,
                            // Optional: watermark effect
                            // opacity: 0.5
                        });

                        // const timestampText = new Konva.Text({
                        //     x: 250,
                        //     y: 180,
                        //     text: new Date().toDateString(), // Initialize with an empty string
                        //     fontSize: 14,
                        //     fontFamily: 'Arial',
                        //     fill: 'black',
                        // });

                        const layer = stage.getLayers()[0] || new Konva.Layer();
                        const signatureLayer = stage.getLayers()[1] || new Konva.Layer();

                        layer.destroyChildren();
                        layer.add(bgImage);
                        // layer.add(timestampText)

                        if (stage.getLayers().length === 0) {
                            stage.add(layer);
                            stage.add(signatureLayer);
                        }

                        stage.draw();
                        setIsOKButtonDisabled(false);
                    };

                }
            };

            reader.readAsDataURL(_file);
        }
    };

    const [isTimestampEnabled, setIsTimestampEnabled] = useState(false);
    const timestampRef = useRef<Konva.Text | null>(null);

    const handleToggleTimestamp = (event: React.ChangeEvent<HTMLInputElement>) => {
        const checked = event.target.checked;
        setIsTimestampEnabled(checked);

        const stage = konvaStageRef.current;
        if (!stage) return;

        const layer = stage.getLayers()[0] || new Konva.Layer();
        const signatureLayer = stage.getLayers()[1] || new Konva.Layer();
        if (!signatureLayer) return;

        // Remove previous timestamp if exists
        if (timestampRef.current) {
            timestampRef.current.destroy();
            timestampRef.current = null;
            signatureLayer.draw();
        }

        if (checked) {

            const timestampText = new Konva.Text({
                x: 250,
                y: 180,
                text: new Date().toDateString(), // Initialize with an empty string
                fontSize: 14,
                fontFamily: 'Arial',
                fill: 'black',
            });

            layer.add(timestampText);
            timestampRef.current = timestampText;

            if (stage.getLayers().length === 0) {
                stage.add(layer);
                stage.add(signatureLayer);
            }

        }
    };



    return (
        <>
            <Popover
                overlayClassName="SignaturePop"
                content={
                    <div>
                        <ul className="SignaturePop-Container">
                            {signatures.map((signature, index) => {
                                return (
                                    <li key={index}>
                                        <img
                                            onClick={() => {
                                                handleAdd(signature) // 选择一个签名进行添加
                                            }}
                                            src={signature}
                                            height={40}
                                        />
                                        {/* <span>
                                            <DeleteOutlined /> // 签名删除按钮，未启用
                                        </span> */}
                                    </li>
                                )
                            })}
                        </ul>
                        {signatures.length < 1 && (
                            <div className="SignaturePop-Toolbar">
                                <Button block type="link" onClick={openModal} icon={<PlusCircleOutlined />}>
                                    {t('toolbar.buttons.createSignature')}
                                </Button>
                            </div>
                        )}
                    </div>
                }
                trigger="click"
                open={isPopoverOpen}
                onOpenChange={handleOpenChange}
                placement="bottom"
                arrow={false}
            >
                <>
                    <div className="icon">{props.annotation.icon}</div>
                    <div className="name">{t(`annotations.${props.annotation.name}`)}</div>
                </>
            </Popover>
            <Modal
                title={t('toolbar.buttons.createSignature')}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnClose={true}
                okText={t('normal.ok')}
                cancelText={t('normal.cancel')}
                afterOpenChange={afterOpen}
                okButtonProps={{ disabled: isOKButtonDisabled }}
                className="SignatureTool"
            >
                <div>
                    <div className="SignatureTool-Container" style={{ width: defaultOptions.signature.WIDTH }}>
                        <div className="SignatureTool-Container-info">{t('toolbar.message.signatureArea')}</div>
                        <div ref={containerRef} style={{ height: defaultOptions.signature.HEIGHT, width: defaultOptions.signature.WIDTH }}></div>
                    </div>
                    <div className="SignatureTool-Toolbar" style={{ width: defaultOptions.signature.WIDTH }}>
                        <div className="colorPalette">
                            {defaultOptions.signature.COLORS.map(color => (
                                <div onClick={() => changeColor(color)} className={`cell ${color === currentColor ? 'active' : ''}`} key={color}>
                                    <span style={{ backgroundColor: color }}></span>
                                </div>
                            ))}
                        </div>
                        <div
                            className="clear"
                            onClick={() => {
                                if (konvaStageRef.current) {
                                    // 清空绘制内容
                                    konvaStageRef.current.clear()
                                    konvaStageRef.current.getLayers().forEach(layer => layer.destroyChildren())
                                    setIsOKButtonDisabled(true) // 禁用 OK 按钮
                                }
                            }}
                        >
                            {t('normal.clear')}
                        </div>
                    </div>
                    <div>
                        <div className='SignatureStamp-Block'>
                            <div>Stamp/Watermark</div>
                            <input type="file" accept=".png,.jpg" onChange={onInputFileChange} />
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={isTimestampEnabled}
                                    onChange={handleToggleTimestamp}
                                />
                                {' '}Add Timestamp
                            </label>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    )
}

export { SignatureTool }