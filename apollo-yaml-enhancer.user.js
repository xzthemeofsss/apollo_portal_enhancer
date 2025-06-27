// ==UserScript==
// @name         Apollo YAML 全屏编辑器 + Diff 高亮增强
// @namespace    http://tampermonkey.net/
// @version      3.8.0
// @description  Apollo配置中心 - 点击修改配置按钮时启动全屏YAML编辑器，发布时提供diff高亮显示
// @author       xzthemeofsss
// @match        http*://*/*config.html*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false; // 关闭详细调试输出
    const SCRIPT_NAME = '[Apollo 全屏编辑器]';
    
    // 全局变量：存储当前点击的namespace信息
    let currentClickedNamespace = null;
    
    // 全局变量：diff增强相关
    let publishModalObserver = null;
    let diffEnhancementActive = false;
    
    function log(...args) {
        if (DEBUG) {
            console.log(SCRIPT_NAME, ...args);
        }
    }

    function error(...args) {
        console.error(SCRIPT_NAME, ...args);
    }


    // 检查是否是配置页面
    function isConfigPage() {
        const url = window.location.href;
        const pathname = window.location.pathname;
        
        // 排除心跳检查页面和其他无关页面
        const excludePages = [
            'default_sso_heartbeat.html',
            '/login',
            '/logout',
            '/health'
        ];
        
        for (let exclude of excludePages) {
            if (url.includes(exclude) || pathname.includes(exclude)) {
                log('⚠️ 排除页面:', exclude);
                return false;
            }
        }
        
        return true; // 在所有Apollo页面都运行，不限制特定关键词
    }

    // 等待条件满足
    function waitForCondition(condition, timeout = 30000) {
        return new Promise((resolve) => {
            let elapsed = 0;
            const interval = 500;
            
            function check() {
                if (condition()) {
                    resolve(true);
                } else if (elapsed >= timeout) {
                    resolve(false);
                } else {
                    elapsed += interval;
                    setTimeout(check, interval);
                }
            }
            check();
        });
    }

    // 获取ACE编辑器内容
    function getACEEditorContent() {
        log('🔍 获取ACE编辑器内容...');
        
        if (!window.ace) {
            log('❌ ACE编辑器未加载');
            return '';
        }

        const aceElements = document.querySelectorAll('.ace_editor');
        log(`📍 找到 ${aceElements.length} 个ACE编辑器`);

        for (let i = 0; i < aceElements.length; i++) {
            const aceElement = aceElements[i];
            
            // 检查编辑器是否可见
            const isVisible = aceElement.offsetParent !== null;
            const hasSize = aceElement.offsetWidth > 0 && aceElement.offsetHeight > 0;
            
            log(`📍 ACE编辑器 ${i}: 可见=${isVisible}, 尺寸=${aceElement.offsetWidth}x${aceElement.offsetHeight}`);
            
            // 只处理可见的编辑器
            if (isVisible && hasSize) {
                try {
                    const editor = window.ace.edit(aceElement);
                    if (editor && editor.getValue) {
                        const content = editor.getValue();
                        log(`✅ ACE编辑器 ${i} 内容长度: ${content.length}`);
                        if (content && content.trim().length > 0) {
                            log('✅ 找到ACE编辑器内容!');
                            return content;
                        }
                    }
                } catch (e) {
                    log(`❌ ACE编辑器 ${i} 获取失败:`, e.message);
                }
            }
        }
        
        log('❌ 未找到有内容的ACE编辑器');
        return '';
    }

    // 增强版设置ACE编辑器内容
    function setACEEditorContent(content) {
        log('📝 增强版设置ACE编辑器内容...');
        
        if (!content || content.trim().length === 0) {
            log('❌ 拒绝设置空内容，避免数据丢失');
            return false;
        }
        
        if (!window.ace) {
            log('❌ ACE编辑器未加载');
            return false;
        }

        // 策略1: 查找所有可能的ACE编辑器选择器
        const selectors = [
            '.ace_editor',
            '#ace-editor', 
            '[class*="ace_editor"]',
            '.ace-editor',
            'div[id*="ace"]',
            'textarea + .ace_editor'
        ];
        
        let allAceElements = [];
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            log(`🔍 选择器 "${selector}" 找到 ${elements.length} 个元素`);
            allAceElements.push(...elements);
        });
        
        // 去重
        allAceElements = [...new Set(allAceElements)];
        log(`🔍 总共找到 ${allAceElements.length} 个不重复的ACE编辑器候选`);
        
        for (let i = 0; i < allAceElements.length; i++) {
            const aceElement = allAceElements[i];
            const isVisible = aceElement.offsetParent !== null;
            const hasSize = aceElement.offsetWidth > 0 && aceElement.offsetHeight > 0;
            const className = aceElement.className;
            const id = aceElement.id;
            
            log(`📍 ACE编辑器候选 ${i}:`);
            log(`   - ID: "${id}"`);
            log(`   - Class: "${className}"`);
            log(`   - 可见: ${isVisible}`);
            log(`   - 尺寸: ${aceElement.offsetWidth}x${aceElement.offsetHeight}`);
            
            // 策略2: 不仅检查可见性，也尝试不可见的编辑器
            if (hasSize || aceElement.offsetWidth > 100) { // 放宽条件
                try {
                    const editor = window.ace.edit(aceElement);
                    if (editor && editor.setValue) {
                        // 安全检查：确认当前内容
                        const currentContent = editor.getValue();
                        log(`📄 编辑器 ${i} 当前内容长度: ${currentContent.length}`);
                        log(`📄 要设置的内容长度: ${content.length}`);
                        log(`📄 当前内容预览: "${currentContent.substring(0, 100)}..."`);
                        
                        // 设置新内容
                        editor.setValue(content);
                        editor.clearSelection();
                        
                        // 多种事件触发方式
                        try {
                            editor.session._signal('change');
                            editor.session._signal('changeAnnotation');
                            editor._signal('changeSelection');
                            
                            // 模拟用户输入事件
                            const event = new Event('input', { bubbles: true });
                            aceElement.dispatchEvent(event);
                            
                            const changeEvent = new Event('change', { bubbles: true });
                            aceElement.dispatchEvent(changeEvent);
                            
                        } catch (e) {
                            log(`⚠️ 触发事件时出错: ${e.message}`);
                        }
                        
                        // 验证设置是否成功
                        const newContent = editor.getValue();
                        if (newContent === content) {
                            log(`✅ 成功设置ACE编辑器 ${i} 内容，已验证`);
                            
                            // 额外的验证：检查Angular scope是否感知到变化
                            try {
                                const element = aceElement.parentElement || aceElement;
                                const scope = window.angular.element(element).scope();
                                if (scope && scope.$apply) {
                                    scope.$apply();
                                    log(`✅ 已触发Angular scope.$apply()`);
                                }
                            } catch (e) {
                                log(`⚠️ Angular scope触发失败: ${e.message}`);
                            }
                            
                            return true;
                        } else {
                            log(`❌ 编辑器 ${i} 内容设置后验证失败`);
                            log(`   期望长度: ${content.length}, 实际长度: ${newContent.length}`);
                        }
                    } else {
                        log(`❌ 编辑器 ${i} 没有setValue方法`);
                    }
                } catch (e) {
                    log(`❌ 设置ACE编辑器 ${i} 失败:`, e.message);
                }
            } else {
                log(`⏭️ 跳过编辑器 ${i}：尺寸太小或不可见`);
            }
        }
        
        // 策略3: 尝试查找页面上的textarea元素
        log('🔄 策略3: 查找textarea元素...');
        const textareas = document.querySelectorAll('textarea');
        log(`🔍 找到 ${textareas.length} 个textarea元素`);
        
        for (let i = 0; i < textareas.length; i++) {
            const textarea = textareas[i];
            const isVisible = textarea.offsetParent !== null;
            
            if (isVisible && textarea.value !== undefined) {
                log(`📍 尝试设置textarea ${i}`);
                
                try {
                    const oldValue = textarea.value;
                    textarea.value = content;
                    
                    // 触发事件
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    if (textarea.value === content) {
                        log(`✅ 成功设置textarea ${i} 内容`);
                        return true;
                    }
                } catch (e) {
                    log(`❌ 设置textarea ${i} 失败:`, e.message);
                }
            }
        }
        
        log('❌ 所有策略都失败了，无法设置页面编辑器内容');
        return false;
    }

    // 设置Apollo编辑状态（基于源码分析）
    function setApolloEditState(content) {
        log('🎯 开始设置Apollo编辑状态...');
        
        // 严格验证内容
        if (!content) {
            log('❌ 内容为null/undefined，拒绝设置');
            return false;
        }
        
        if (typeof content !== 'string') {
            log('❌ 内容不是字符串类型，拒绝设置');
            return false;
        }
        
        if (content.trim().length === 0) {
            log('❌ 内容为空字符串，拒绝设置');
            return false;
        }
        
        log(`📝 验证通过，内容长度: ${content.length}, 内容预览: "${content.substring(0, 100)}..."`);
        
        if (!window.angular) {
            log('❌ 未找到Angular');
            return false;
        }
        
        const allElements = document.querySelectorAll('*');
        let stateSet = false;
        let debugInfo = {
            foundScopes: 0,
            foundNamespaces: 0,
            foundEditingNamespaces: 0,
            namespaceInfo: []
        };
        
        for (let element of allElements) {
            try {
                const scope = window.angular.element(element).scope();
                if (!scope) continue;
                
                debugInfo.foundScopes++;
                
                // 查找任何包含namespaces的scope
                if (scope.namespaces && Array.isArray(scope.namespaces)) {
                    debugInfo.foundNamespaces++;
                    log(`🔍 找到包含namespaces的scope，包含 ${scope.namespaces.length} 个namespace`);
                    
                    // 查找所有namespace的信息，但只设置目标namespace
                    let targetNamespace = null;
                    let currentEditingNamespace = null;
                    
                    // 优先级0：使用点击时识别的namespace
                    if (currentClickedNamespace && currentClickedNamespace.name) {
                        log(`🎯 🌟 优先使用点击时识别的namespace: "${currentClickedNamespace.name}"`);
                        
                        // 在namespaces数组中查找匹配的namespace
                        scope.namespaces.forEach((namespace) => {
                            if (namespace.baseInfo && namespace.baseInfo.namespaceName === currentClickedNamespace.name) {
                                currentEditingNamespace = namespace;
                                log(`✅ 在namespaces数组中找到匹配的namespace: "${namespace.baseInfo.namespaceName}"`);
                            }
                        });
                        
                        // 如果有直接的namespace对象引用，优先使用
                        if (currentClickedNamespace.object && currentClickedNamespace.object.baseInfo) {
                            currentEditingNamespace = currentClickedNamespace.object;
                            log(`✅ 直接使用点击时保存的namespace对象`);
                        }
                    }
                    
                    // 第一步：如果没有从点击获取到，找到当前正在编辑的namespace
                    scope.namespaces.forEach((namespace, nsIndex) => {
                        if (namespace.baseInfo) {
                            const nsInfo = {
                                index: nsIndex,
                                name: namespace.baseInfo.namespaceName,
                                isTextEditing: namespace.isTextEditing,
                                hasItems: !!(namespace.items && namespace.items.length > 0)
                            };
                            debugInfo.namespaceInfo.push(nsInfo);
                            
                            log(`📍 Namespace ${nsIndex}: ${nsInfo.name}, 编辑状态: ${nsInfo.isTextEditing}, 有配置项: ${nsInfo.hasItems}`);
                            
                            // 只有在没有从点击获取到namespace时，才查找正在编辑的namespace
                            if (!currentEditingNamespace && namespace.isTextEditing === true) {
                                currentEditingNamespace = namespace;
                                log(`🎯 ✅ 找到正在编辑的namespace "${namespace.baseInfo.namespaceName}"`);
                            }
                        }
                    });
                    
                    // 如果还没有找到namespace，查找application namespace作为默认
                    if (!currentEditingNamespace) {
                        scope.namespaces.forEach((namespace) => {
                            if (namespace.baseInfo && namespace.baseInfo.namespaceName === 'application') {
                                currentEditingNamespace = namespace;
                                log(`🎯 📌 使用默认namespace "application"`);
                            }
                        });
                    }
                    
                    // 如果还是没有找到，使用第一个有配置项的namespace
                    if (!currentEditingNamespace) {
                        scope.namespaces.forEach((namespace) => {
                            if (namespace.baseInfo && namespace.items && namespace.items.length > 0) {
                                currentEditingNamespace = namespace;
                                log(`🎯 🔄 使用第一个有配置项的namespace "${namespace.baseInfo.namespaceName}"`);
                                return;
                            }
                        });
                    }
                    
                    // 第二步：只对目标namespace进行设置
                    if (currentEditingNamespace && currentEditingNamespace.baseInfo) {
                        targetNamespace = currentEditingNamespace.baseInfo.namespaceName;
                        debugInfo.targetNamespace = targetNamespace;
                        
                        log(`🎯 ✅ 匹配目标namespace "${targetNamespace}"，设置编辑状态`);
                        
                        // 设置关键状态变量 - 文本模式操作
                        scope.item = scope.item || {};
                        scope.item.tableViewOperType = 'create';  // 文本模式使用create
                        scope.toOperationNamespace = currentEditingNamespace;    // 关键！
                        
                        // 设置文本模式的配置
                        scope.item.key = '';  // 文本模式key为空
                        scope.item.value = content;
                        scope.item.type = '0';
                        scope.item.lineNum = 1;
                        
                        // 设置文本模式特有的字段
                        scope.configText = content;  // 全局configText
                        scope.item.configText = content;  // item级别configText
                        
                        // 设置更多namespace状态
                        currentEditingNamespace.hasText = true;
                        currentEditingNamespace.configText = content;  // 可能这是关键字段！
                        currentEditingNamespace.isModified = true;
                        currentEditingNamespace.viewType = 'text';
                        
                        // 设置可能的全局状态
                        if (scope.$parent) {
                            scope.$parent.configText = content;
                        }
                        
                        // 验证设置的值
                        log(`🔍 设置后验证 scope.item.value: ${typeof scope.item.value}, 长度: ${scope.item.value ? scope.item.value.length : 'null'}`);
                        if (scope.item.value !== content) {
                            log('⚠️ 警告：设置后的值与原始内容不匹配');
                            log(`   原始内容: "${content.substring(0, 50)}..."`);
                            log(`   设置后的值: "${(scope.item.value || '').substring(0, 50)}..."`);
                            // 重新设置
                            scope.item.value = content;
                            log('🔄 重新设置scope.item.value');
                        }
                        
                        // 强制设置namespace为编辑状态
                        currentEditingNamespace.isTextEditing = true;
                        
                        log('✅ 已设置关键状态变量:');
                        log(`   - 目标namespace: "${targetNamespace}"`);
                        log('   - item.tableViewOperType = "update"');
                        log('   - toOperationNamespace = namespace');
                        log('   - item.value = content');
                        log('   - namespace.isTextEditing = true');
                        
                        stateSet = true;
                        debugInfo.foundEditingNamespaces++;
                        
                        // 成功处理后，清理点击状态
                        if (currentClickedNamespace) {
                            log(`🧹 清理点击状态，已处理namespace: "${currentClickedNamespace.name}"`);
                            currentClickedNamespace = null;
                        }
                    } else {
                        log('❌ 未找到合适的目标namespace');
                        
                        // 输出所有namespace信息供调试
                        scope.namespaces.forEach((namespace, nsIndex) => {
                            if (namespace.baseInfo) {
                                log(`🚫 跳过非目标namespace "${namespace.baseInfo.namespaceName}"`);
                            }
                        });
                    }
                    
                    if (stateSet) {
                        // 触发Angular更新
                        try {
                            scope.$apply();
                            log('✅ 已触发Angular $apply');
                        } catch (e) {
                            // $apply可能抛出错误，但状态已经设置
                            log('⚠️ $apply出现错误，但状态已设置:', e.message);
                        }
                        break;
                    }
                }
                
                // 也检查是否直接有namespace属性（单个namespace）
                if (scope.namespace && scope.namespace.baseInfo) {
                    log('🔍 找到单个namespace scope');
                    
                    scope.item = scope.item || {};
                    scope.item.tableViewOperType = 'update';
                    scope.toOperationNamespace = scope.namespace;
                    scope.item.key = 'content';
                    scope.item.value = content;
                    scope.item.type = '0';
                    scope.item.lineNum = 1;
                    scope.namespace.isTextEditing = true;
                    
                    // 设置更多namespace状态
                    scope.namespace.hasText = true;
                    scope.namespace.configText = content;  // 关键字段
                    scope.namespace.isModified = true;
                    scope.namespace.viewType = 'text';
                    
                    // 设置可能的全局状态
                    if (scope.$parent) {
                        scope.$parent.configText = content;
                    }
                    scope.configText = content;
                    
                    // 验证设置的值
                    log(`🔍 单namespace验证 scope.item.value: ${typeof scope.item.value}, 长度: ${scope.item.value ? scope.item.value.length : 'null'}`);
                    if (scope.item.value !== content) {
                        log('⚠️ 警告：单namespace设置后的值与原始内容不匹配');
                        scope.item.value = content;
                        log('🔄 重新设置单namespace scope.item.value');
                    }
                    
                    stateSet = true;
                    log('✅ 在单个namespace scope中设置了编辑状态');
                    
                    try {
                        scope.$apply();
                        log('✅ 已触发Angular $apply');
                    } catch (e) {
                        log('⚠️ $apply出现错误，但状态已设置:', e.message);
                    }
                    break;
                }
                
            } catch (e) {
                // 忽略错误，继续处理
            }
        }
        
        // 输出调试信息
        log('🔍 调试信息:', debugInfo);
        
        if (!stateSet) {
            log('⚠️ 未找到合适的scope来设置编辑状态，尝试备用方案...');
            
            // 备用方案1：尝试直接在全局scope中设置
            try {
                const rootScope = window.angular.element(document).scope();
                if (rootScope) {
                    rootScope.item = rootScope.item || {};
                    rootScope.item.tableViewOperType = 'update';
                    rootScope.item.value = content;
                    
                    // 验证rootScope设置
                    log(`🔍 rootScope验证 item.value: ${typeof rootScope.item.value}, 长度: ${rootScope.item.value ? rootScope.item.value.length : 'null'}`);
                    if (rootScope.item.value !== content) {
                        log('⚠️ rootScope设置异常，重新设置');
                        rootScope.item.value = content;
                    }
                    
                    rootScope.$apply();
                    log('🔄 已在rootScope中设置编辑状态');
                    stateSet = true;
                }
            } catch (e) {
                log('❌ rootScope设置失败:', e.message);
            }
            
            // 备用方案2：查找任何包含item的scope
            if (!stateSet) {
                for (let element of allElements) {
                    try {
                        const scope = window.angular.element(element).scope();
                        if (scope && scope.item !== undefined) {
                            log('🔄 找到包含item的scope，尝试设置...');
                            scope.item = scope.item || {};
                            scope.item.tableViewOperType = 'update';
                            scope.item.value = content;
                            scope.$apply();
                            stateSet = true;
                            log('✅ 在包含item的scope中设置了编辑状态');
                            break;
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
            }
            
            // 备用方案3：强制在任何scope中创建状态
            if (!stateSet) {
                for (let element of allElements) {
                    try {
                        const scope = window.angular.element(element).scope();
                        if (scope && scope.$apply) {
                            log('🔄 强制在任意scope中创建编辑状态...');
                            scope.item = {
                                tableViewOperType: 'update',
                                value: content,
                                key: 'content',
                                type: '0',
                                lineNum: 1
                            };
                            scope.$apply();
                            stateSet = true;
                            log('✅ 强制创建编辑状态成功');
                            break;
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
            }
        }
        
        if (stateSet) {
            log('🎉 Apollo编辑状态设置成功！');
        } else {
            log('❌ 所有方案都失败了，无法设置编辑状态');
        }
        
        return stateSet;
    }

    // 自动提交修改（基于源码分析，增强版）
    function autoCommitChanges() {
        log('🚀 开始自动提交修改...');
        
        if (!window.angular) {
            log('❌ 未找到Angular');
            return false;
        }
        
        // 查找提交修改按钮 - 增强版选择器
        const submitSelectors = [
            'img[ng-click*="modifyByText"]',
            'button[ng-click*="modifyByText"]', 
            '[data-original-title="提交修改"]',
            'img[data-original-title="提交修改"]',
            'button[data-original-title="提交修改"]',
            '[title="提交修改"]',
            'img[title="提交修改"]',
            'button[title="提交修改"]',
            // 更广泛的选择器
            '[ng-click*="modifyByText"]',
            'img[src*="submit"]',
            'img[src*="commit"]',
            '.submit-btn',
            '.commit-btn'
        ];
        
        let allSubmitButtons = [];
        submitSelectors.forEach(selector => {
            try {
                const buttons = document.querySelectorAll(selector);
                allSubmitButtons.push(...buttons);
            } catch (e) {
                // 忽略无效选择器
            }
        });
        
        // 去重
        allSubmitButtons = [...new Set(allSubmitButtons)];
        log(`🔍 找到 ${allSubmitButtons.length} 个可能的提交按钮`);
        
        let targetButton = null;
        
        for (let btn of allSubmitButtons) {
            const ngClick = btn.getAttribute('ng-click') || '';
            const originalTitle = btn.getAttribute('data-original-title') || '';
            const title = btn.getAttribute('title') || '';
            const isVisible = btn.offsetParent !== null;
            const style = window.getComputedStyle(btn);
            const isDisplayed = style.display !== 'none';
            const isVisibilityVisible = style.visibility !== 'hidden';
            const hasOpacity = parseFloat(style.opacity) > 0;
            
            log(`📍 检查按钮: ng-click="${ngClick}", title="${originalTitle || title}", 可见=${isVisible}, display=${isDisplayed}, visibility=${isVisibilityVisible}, opacity=${style.opacity}`);
            
            if (ngClick.includes('modifyByText') && (originalTitle === '提交修改' || title === '提交修改')) {
                targetButton = btn;
                log('🎯 找到目标提交修改按钮');
                break;
            }
        }
        
        if (!targetButton) {
            log('❌ 未找到合适的提交按钮');
            return false;
        }
        
        // 强制显示按钮（如果不可见）
        if (targetButton.offsetParent === null) {
            log('🔧 按钮不可见，尝试强制显示...');
            
            // 方法1：直接修改样式
            const originalStyle = {
                display: targetButton.style.display,
                visibility: targetButton.style.visibility,
                opacity: targetButton.style.opacity,
                position: targetButton.style.position,
                left: targetButton.style.left,
                top: targetButton.style.top
            };
            
            targetButton.style.display = 'inline-block';
            targetButton.style.visibility = 'visible';
            targetButton.style.opacity = '1';
            targetButton.style.position = 'relative';
            targetButton.style.left = 'auto';
            targetButton.style.top = 'auto';
            
            // 方法2：修改父元素样式
            let parent = targetButton.parentElement;
            let parentOriginalStyles = [];
            while (parent && parent !== document.body) {
                const parentStyle = window.getComputedStyle(parent);
                if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
                    parentOriginalStyles.push({
                        element: parent,
                        display: parent.style.display,
                        visibility: parent.style.visibility
                    });
                    parent.style.display = 'block';
                    parent.style.visibility = 'visible';
                    log(`🔧 修改父元素样式: ${parent.tagName}[${parent.className}]`);
                }
                parent = parent.parentElement;
            }
            
            // 检查是否现在可见
            const nowVisible = targetButton.offsetParent !== null;
            log(`🔍 强制显示后按钮可见性: ${nowVisible}`);
        }
        
        log('🎯 准备点击提交修改按钮...');
        
        try {
            // 多种点击方式
            const clickMethods = [
                // 方法1：直接点击
                () => {
                    targetButton.click();
                    log('✅ 方法1：直接点击完成');
                    return true;
                },
                
                // 方法2：模拟鼠标事件
                () => {
                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                        const event = new MouseEvent(eventType, { 
                            bubbles: true, 
                            cancelable: true,
                            view: window
                        });
                        targetButton.dispatchEvent(event);
                    });
                    log('✅ 方法2：鼠标事件完成');
                    return true;
                },
                
                                 // 方法3：通过Angular scope触发文本模式提交
                 () => {
                     const scope = window.angular.element(targetButton).scope();
                     if (scope && scope.modifyByText) {
                         // 查找当前namespace（优先使用点击时识别的）
                         let currentNamespace = null;
                         
                         if (currentClickedNamespace && currentClickedNamespace.object) {
                             currentNamespace = currentClickedNamespace.object;
                             log(`✅ 使用点击时识别的namespace: "${currentClickedNamespace.name}"`);
                         } else if (scope.namespace) {
                             currentNamespace = scope.namespace;
                         } else if (scope.namespaces) {
                             currentNamespace = scope.namespaces.find(ns => ns.isTextEditing);
                         }
                         
                         if (currentNamespace) {
                             // 确保namespace处于文本编辑模式
                             currentNamespace.isTextEditing = true;
                             currentNamespace.viewType = 'text';
                             
                             scope.modifyByText(currentNamespace);
                             scope.$apply();
                             log('✅ 方法3：Angular scope调用完成');
                             return true;
                         }
                     }
                     return false;
                 },
                
                // 方法4：强制执行ng-click
                () => {
                    const ngClick = targetButton.getAttribute('ng-click');
                    if (ngClick && window.angular) {
                        const scope = window.angular.element(targetButton).scope();
                        if (scope) {
                            // 解析ng-click表达式
                            try {
                                scope.$eval(ngClick);
                                scope.$apply();
                                log('✅ 方法4：ng-click执行完成');
                                return true;
                            } catch (e) {
                                log(`❌ 方法4失败: ${e.message}`);
                            }
                        }
                    }
                    return false;
                }
            ];
            
            // 依次尝试每种方法
            let success = false;
            for (let i = 0; i < clickMethods.length; i++) {
                try {
                    log(`🔄 尝试点击方法 ${i + 1}/${clickMethods.length}`);
                    if (clickMethods[i]()) {
                        success = true;
                        break;
                    }
                } catch (e) {
                    log(`❌ 点击方法 ${i + 1} 失败: ${e.message}`);
                }
            }
            
            if (success) {
                log('✅ 已成功触发提交修改');
                
                // 快速智能确认模态框
                let attemptCount = 0;
                const maxAttempts = 6; // 减少重试次数
                
                function waitAndConfirm() {
                    attemptCount++;
                    log(`🔄 尝试确认模态框 ${attemptCount}/${maxAttempts}`);
                    
                    setTimeout(() => {
                        const confirmed = autoConfirmCommit();
                        
                        if (!confirmed && attemptCount < maxAttempts) {
                            setTimeout(waitAndConfirm, 150); // 减少等待间隔
                        } else if (attemptCount >= maxAttempts) {
                            log('⚠️ 达到最大重试次数，开始强制确认');
                            setTimeout(() => {
                                const forceResult = forceConfirmModal();
                                if (!forceResult) {
                                    log('⚠️ 所有确认方法都失败，但提交可能已成功');
                                }
                            }, 200);
                        }
                    }, 80); // 减少模态框等待时间
                }
                
                // 开始等待和确认过程
                setTimeout(waitAndConfirm, 150);
                
                return true;
            } else {
                log('❌ 所有点击方法都失败了');
                return false;
            }
            
        } catch (e) {
            error('❌ 点击提交修改按钮失败:', e);
            return false;
        }
    }

    // 强制确认模态框（最后手段，增强版）
    function forceConfirmModal() {
        log('🔥 开始强制确认模态框...');
        
        // 1. 尝试所有可能的确认方式
        const confirmMethods = [
            // 方法1：查找Bootstrap模态框并点击确认
            () => {
                const bootstrapModals = document.querySelectorAll('.modal.in, .modal.show, .modal[style*="display: block"], .modal[style*="display:block"]');
                for (let modal of bootstrapModals) {
                    const confirmBtns = modal.querySelectorAll('button.btn-primary, button.btn-success, button.btn-confirm, .btn-primary, .btn-success');
                    for (let btn of confirmBtns) {
                        if (btn.offsetParent !== null || btn.style.display !== 'none') {
                            log('🎯 强制点击Bootstrap确认按钮');
                            btn.click();
                            // 多次点击确保生效
                            setTimeout(() => btn.click(), 50);
                            setTimeout(() => btn.click(), 100);
                            return true;
                        }
                    }
                }
                return false;
            },
            
            // 方法2：查找所有可见按钮，根据文本确认
            () => {
                const allBtns = document.querySelectorAll('button, input[type="button"], input[type="submit"], .btn');
                for (let btn of allBtns) {
                    const text = (btn.textContent || btn.value || '').trim().toLowerCase();
                    const confirmTexts = ['确认', '确定', '提交', 'ok', 'yes', '保存', 'submit', 'save', 'confirm'];
                    
                    if ((btn.offsetParent !== null || btn.style.display !== 'none') && 
                        confirmTexts.some(t => text.includes(t))) {
                        log(`🎯 强制点击文本确认按钮: "${btn.textContent || btn.value}"`);
                        btn.focus();
                        btn.click();
                        // 多次点击和事件触发
                        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                            const event = new MouseEvent(eventType, { bubbles: true, cancelable: true });
                            btn.dispatchEvent(event);
                        });
                        return true;
                    }
                }
                return false;
            },
            
            // 方法3：强制模拟多种键盘确认
            () => {
                log('🎯 强制发送多种确认键');
                const keys = [
                    { key: 'Enter', keyCode: 13 },
                    { key: ' ', keyCode: 32 }, // 空格键
                    { key: 'y', keyCode: 89 }, // Y键
                ];
                
                keys.forEach(keyInfo => {
                    ['keydown', 'keypress', 'keyup'].forEach(eventType => {
                        const event = new KeyboardEvent(eventType, {
                            key: keyInfo.key,
                            keyCode: keyInfo.keyCode,
                            which: keyInfo.keyCode,
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(event);
                        document.body.dispatchEvent(event);
                    });
                });
                return true;
            },
            
            // 方法4：查找任何可能的确认元素
            () => {
                const possibleConfirms = document.querySelectorAll(
                    '[data-confirm], [data-submit], [data-ok], ' +
                    '[class*="confirm"], [class*="submit"], [class*="ok"], ' +
                    '[id*="confirm"], [id*="submit"], [id*="ok"]'
                );
                
                for (let elem of possibleConfirms) {
                    if ((elem.offsetParent !== null || elem.style.display !== 'none') && 
                        (elem.tagName === 'BUTTON' || elem.tagName === 'INPUT' || elem.onclick || elem.click)) {
                        log(`🎯 强制点击可能的确认元素: ${elem.tagName}[${elem.className}]`);
                        if (elem.click) {
                            elem.click();
                            return true;
                        }
                    }
                }
                return false;
            },
            
            // 方法5：查找模态框内第一个按钮并点击
            () => {
                const modals = document.querySelectorAll('.modal, [role="dialog"], .dialog, .popup');
                for (let modal of modals) {
                    if (modal.offsetParent !== null || modal.style.display !== 'none') {
                        const firstBtn = modal.querySelector('button, input[type="button"], input[type="submit"]');
                        if (firstBtn && firstBtn.offsetParent !== null) {
                            log(`🎯 强制点击模态框内第一个按钮: "${firstBtn.textContent}"`);
                            firstBtn.click();
                            return true;
                        }
                    }
                }
                return false;
            },
            
            // 方法6：暴力点击页面右下角的按钮（通常是确认按钮位置）
            () => {
                const allBtns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                const visibleBtns = allBtns.filter(btn => 
                    (btn.offsetParent !== null || btn.style.display !== 'none') && 
                    !btn.disabled
                );
                
                if (visibleBtns.length > 0) {
                    // 按位置排序，优先右下角的按钮
                    visibleBtns.sort((a, b) => {
                        const rectA = a.getBoundingClientRect();
                        const rectB = b.getBoundingClientRect();
                        return (rectB.right + rectB.bottom) - (rectA.right + rectA.bottom);
                    });
                    
                    const targetBtn = visibleBtns[0];
                    log(`🎯 强制点击位置最佳按钮: "${targetBtn.textContent}"`);
                    targetBtn.click();
                    return true;
                }
                return false;
            }
        ];
        
        // 依次尝试每种方法
        for (let i = 0; i < confirmMethods.length; i++) {
            try {
                log(`🔥 尝试强制确认方法 ${i + 1}/${confirmMethods.length}`);
                if (confirmMethods[i]()) {
                    log(`✅ 强制确认方法 ${i + 1} 成功`);
                    // 等待一下看效果
                    setTimeout(() => {
                        // 检查模态框是否消失
                        const visibleModals = document.querySelectorAll('.modal.in, .modal.show, .modal[style*="display: block"]');
                        if (visibleModals.length === 0) {
                            log('✅ 模态框已消失，强制确认真正成功');
                        }
                    }, 200);
                    return true;
                }
            } catch (e) {
                log(`❌ 强制确认方法 ${i + 1} 失败:`, e.message);
            }
        }
        
        log('❌ 所有强制确认方法都失败了，但会静默处理');
        return false;
    }

    // 自动确认提交模态框（增强版）
    function autoConfirmCommit() {
        log('📋 寻找提交确认模态框...');
        
        // 查找所有可能的模态框元素
        const modalSelectors = [
            '.modal',
            '.modal-dialog', 
            '.modal-content',
            '.swal2-container',
            '.alert',
            '.dialog',
            '.confirm',
            '.popup',
            '[role="dialog"]',
            '.ui-dialog',
            '.overlay',
            '.modal-backdrop',
            // Bootstrap模态框
            '.modal.fade.in',
            '.modal.show',
            // 自定义模态框
            '[id*="modal"]',
            '[class*="modal"]',
            '[id*="dialog"]',
            '[class*="dialog"]'
        ];
        
        let modals = [];
        modalSelectors.forEach(selector => {
            try {
                const found = document.querySelectorAll(selector);
                modals.push(...found);
            } catch (e) {
                // 忽略无效的选择器
            }
        });
        
        // 去重
        modals = [...new Set(modals)];
        log(`🔍 找到 ${modals.length} 个可能的模态框`);
        
        // 查找可见的模态框
        let activeModal = null;
        for (let modal of modals) {
            const style = window.getComputedStyle(modal);
            const isVisible = modal.offsetParent !== null && 
                             style.display !== 'none' && 
                             style.visibility !== 'hidden' &&
                             style.opacity !== '0';
            
            if (isVisible) {
                log('📋 找到可见的模态框');
                activeModal = modal;
                break;
            }
        }
        
        if (!activeModal) {
            log('❌ 未找到可见的模态框');
            return false;
        }
        
        // 查找确认按钮 - 使用更广泛的选择器
        const confirmSelectors = [
            'button[ng-click*="confirm"]',
            'button[ng-click*="submit"]',
            'button[ng-click*="save"]',
            'button[ng-click*="ok"]',
            'button[ng-click*="yes"]',
            'button[ng-click*="commit"]',
            'button[onclick*="confirm"]',
            'button[onclick*="submit"]',
            'button:contains("确认")',
            'button:contains("确定")',
            'button:contains("OK")',
            'button:contains("Yes")',
            'button:contains("提交")',
            'button:contains("保存")',
            '.btn-primary',
            '.btn-success',
            '.btn-confirm',
            '.confirm-button',
            '.ok-button',
            '.submit-button'
        ];
        
        let confirmButton = null;
        
        // 在模态框内查找确认按钮
        for (let selector of confirmSelectors) {
            try {
                const buttons = activeModal.querySelectorAll(selector);
                for (let btn of buttons) {
                    if (btn.offsetParent !== null) {
                        confirmButton = btn;
                        log(`✅ 找到确认按钮: ${btn.textContent || btn.className}`);
                        break;
                    }
                }
                if (confirmButton) break;
            } catch (e) {
                // 忽略错误的选择器
            }
        }
        
        // 如果没找到，查找所有按钮，根据文本确定
        if (!confirmButton) {
            const allButtons = activeModal.querySelectorAll('button, input[type="button"], input[type="submit"]');
            for (let btn of allButtons) {
                const text = (btn.textContent || btn.value || '').trim().toLowerCase();
                const confirmTexts = ['确认', '确定', 'ok', 'yes', '提交', '保存', 'submit', 'save', 'confirm'];
                if (confirmTexts.some(t => text.includes(t)) && btn.offsetParent !== null) {
                    confirmButton = btn;
                    log(`✅ 根据文本找到确认按钮: "${btn.textContent || btn.value}"`);
                    break;
                }
            }
        }
        
        if (confirmButton) {
            log('🎯 点击确认按钮...');
            try {
                // 多种点击方式
                confirmButton.focus();
                confirmButton.click();
                
                // 触发事件
                ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                    const event = new MouseEvent(eventType, { bubbles: true, cancelable: true });
                    confirmButton.dispatchEvent(event);
                });
                
                log('✅ 已点击确认按钮');
                return true;
            } catch (e) {
                error('❌ 点击确认按钮失败:', e);
            }
        } else {
            // 尝试Enter键确认
            log('🔄 尝试Enter键确认...');
            try {
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                
                activeModal.dispatchEvent(enterEvent);
                document.dispatchEvent(enterEvent);
                log('✅ 已发送Enter键事件');
                
                // 也尝试在document上触发
                setTimeout(() => {
                    document.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    }));
                }, 50);
                
            } catch (e) {
                error('❌ Enter键事件失败:', e);
            }
            
            // 备用方案：查找页面上的确认按钮
            log('🔄 备用方案：查找页面上的确认按钮...');
            const pageConfirmButtons = document.querySelectorAll('button:contains("确认"), button:contains("确定"), .btn-primary, .btn-success');
            
            for (let btn of pageConfirmButtons) {
                if (btn.offsetParent !== null) {
                    log(`🎯 找到页面确认按钮: ${btn.textContent}`);
                    try {
                        btn.click();
                        log('✅ 已点击页面确认按钮');
                        return true;
                    } catch (e) {
                        error('❌ 点击页面确认按钮失败:', e);
                    }
                }
            }
            
            log('⚠️ 未找到确认按钮，进行静默处理');
        }
        
        return false;
    }

    // 创建全屏编辑器
    function createFullscreenEditor(initialContent = '') {
        log('🖥️ 创建全屏编辑器...');
        
        // 移除已存在的编辑器
        const existing = document.getElementById('apollo-fullscreen-editor');
        if (existing) {
            document.body.removeChild(existing);
        }
        
        const overlay = document.createElement('div');
        overlay.id = 'apollo-fullscreen-editor';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #fdf6e3;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        `;

        // 创建顶部工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            background: #f4f0d9;
            color: #5c6a72;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid #e6dcc6;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(92, 106, 114, 0.1);
        `;

        // 标题
        const title = document.createElement('h3');
        
        // 获取当前的 env、cluster 和 namespace 信息
        function getCurrentEnvClusterAndNamespace() {
            let envName = '';
            let clusterName = '';
            let namespaceName = '';
            
            try {
                // 方法1: 从 currentClickedNamespace 获取 namespace
                if (currentClickedNamespace && currentClickedNamespace.name) {
                    namespaceName = currentClickedNamespace.name;
                }
                
                // 方法2: 从 URL 参数获取（包括 hash 中的参数）
                // 首先尝试从标准 URL 参数获取
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('env')) {
                    envName = urlParams.get('env');
                }
                if (urlParams.has('cluster')) {
                    clusterName = urlParams.get('cluster');
                }
                if (urlParams.has('namespace')) {
                    namespaceName = urlParams.get('namespace') || namespaceName;
                }
                
                // 如果没有获取到，尝试从 hash 中的参数获取
                if (!envName || !clusterName || !namespaceName) {
                    const hashPart = window.location.hash;
                    if (hashPart && hashPart.includes('&')) {
                        // 解析 hash 中的参数，格式如: #/appid=xxx&env=xxx&cluster=xxx
                        const hashParams = hashPart.substring(1); // 去掉 #
                        const params = new URLSearchParams(hashParams);
                        
                        if (!envName && params.has('env')) {
                            envName = params.get('env');
                        }
                        if (!clusterName && params.has('cluster')) {
                            clusterName = params.get('cluster');
                        }
                        if (!namespaceName && params.has('namespace')) {
                            namespaceName = params.get('namespace');
                        }
                    }
                }
                
                // 方法3: 兜底 - 从页面元素中获取
                if (!envName || !clusterName) {
                    // 查找环境选择器
                    const envSelectors = [
                        '.env-selector .selected',
                        '.environment-selector .active',
                        '[ng-model*="env"] option:checked',
                        'select[ng-model*="env"] option:selected',
                        '.breadcrumb .env',
                        '.nav-item.active',
                        '.dropdown-toggle:contains("环境")',
                        '.env-name',
                        '.current-env'
                    ];
                    
                    for (let selector of envSelectors) {
                        try {
                            const elements = document.querySelectorAll(selector);
                            for (let element of elements) {
                                const text = (element.textContent || element.innerText || element.value || '').trim();
                                if (text && !envName) {
                                    // 过滤掉一些无用的文本
                                    if (text.length < 20 && !text.includes('选择') && !text.includes('环境')) {
                                        envName = text;
                                        break;
                                    }
                                }
                            }
                            if (envName) break;
                        } catch (e) {
                            // 忽略选择器错误
                        }
                    }
                    
                    // 查找集群选择器
                    const clusterSelectors = [
                        '.cluster-selector .selected',
                        '.cluster-selector .active',
                        '[ng-model*="cluster"] option:checked',
                        'select[ng-model*="cluster"] option:selected',
                        '.breadcrumb .cluster',
                        '.cluster-name',
                        '.current-cluster'
                    ];
                    
                    for (let selector of clusterSelectors) {
                        try {
                            const elements = document.querySelectorAll(selector);
                            for (let element of elements) {
                                const text = (element.textContent || element.innerText || element.value || '').trim();
                                if (text && !clusterName) {
                                    // 过滤掉一些无用的文本
                                    if (text.length < 20 && !text.includes('选择') && !text.includes('集群')) {
                                        clusterName = text;
                                        break;
                                    }
                                }
                            }
                            if (clusterName) break;
                        } catch (e) {
                            // 忽略选择器错误
                        }
                    }
                    
                    // 从面包屑导航中提取
                    if (!envName || !clusterName) {
                        const breadcrumbs = document.querySelectorAll('.breadcrumb li, .breadcrumb-item, .nav-breadcrumb span');
                        for (let breadcrumb of breadcrumbs) {
                            const text = (breadcrumb.textContent || breadcrumb.innerText || '').trim();
                            if (text && text.length < 20) {
                                // 常见的环境名模式
                                if (!envName && /^(dev|test|prod|uat|pre|staging|local|pro)$/i.test(text)) {
                                    envName = text;
                                }
                                // 常见的集群名模式
                                if (!clusterName && /^(default|cluster|stg|staging)$/i.test(text)) {
                                    clusterName = text;
                                }
                            }
                        }
                    }
                    
                    // 从Angular scope中获取（简化版）
                    if (window.angular && (!envName || !clusterName)) {
                        try {
                            const rootElement = document.querySelector('[ng-app], [ng-controller]');
                            if (rootElement) {
                                const scope = window.angular.element(rootElement).scope();
                                if (scope) {
                                    if (!envName && scope.env) {
                                        envName = scope.env.name || scope.env;
                                    }
                                    if (!clusterName && scope.cluster) {
                                        clusterName = scope.cluster.name || scope.cluster;
                                    }
                                }
                            }
                        } catch (e) {
                            // 忽略错误
                        }
                    }
                }
                
            } catch (e) {
                // 忽略错误
            }
            
            // 清理数据
            function cleanValue(value) {
                if (!value) return '';
                value = value.replace(/['\"]/g, '').trim();
                const invalidValues = ['undefined', 'null', '', 'unknown', 'config', 'index'];
                if (invalidValues.includes(value.toLowerCase()) || value.includes('.html')) {
                    return '';
                }
                return value;
            }
            
            envName = cleanValue(envName);
            clusterName = cleanValue(clusterName);
            namespaceName = cleanValue(namespaceName);
            
            return { env: envName, cluster: clusterName, namespace: namespaceName };
        }
        
        // 获取环境、集群和命名空间信息
        const envInfo = getCurrentEnvClusterAndNamespace();
        
        // 构建动态标题
        let titleText = '🌲 Apollo YAML 全屏编辑器';
        let tooltipText = '';
        
        if (envInfo.env || envInfo.cluster || envInfo.namespace) {
            const parts = [];
            
            // 如果有环境，添加环境
            if (envInfo.env) {
                parts.push(envInfo.env);
            }
            
            // 如果有集群，添加集群
            if (envInfo.cluster) {
                parts.push(envInfo.cluster);
            }
            
            // 如果有命名空间，添加命名空间
            if (envInfo.namespace) {
                parts.push(envInfo.namespace);
            }
            
            if (parts.length > 0) {
                titleText = `🌲 ${parts.join(' / ')}`;
            }
            
            // 构建 tooltip
            const tooltipParts = [];
            if (envInfo.env) tooltipParts.push(`环境: ${envInfo.env}`);
            if (envInfo.cluster) tooltipParts.push(`集群: ${envInfo.cluster}`);
            if (envInfo.namespace) tooltipParts.push(`命名空间: ${envInfo.namespace}`);
            tooltipText = tooltipParts.join('\n');
        }
        
        title.textContent = titleText;
        
        // 添加 tooltip 显示完整信息
        if (tooltipText) {
            title.title = tooltipText;
        }
        
        title.style.cssText = `
            margin: 0;
            font-size: 16px;
            color: #708089;
            font-weight: 600;
            max-width: 500px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: help;
        `;

        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            margin-left: auto;
            display: flex;
            gap: 8px;
        `;

        // 创建按钮函数
        function createToolbarButton(text, onclick, color = '#8da101') {
            const button = document.createElement('button');
            button.textContent = text;
            button.style.cssText = `
                background: ${color};
                color: #fdf6e3;
                border: 1px solid #a7c080;
                padding: 8px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.2s;
                box-shadow: 0 1px 3px rgba(141, 161, 1, 0.2);
            `;
            
            button.onmouseover = () => {
                button.style.background = '#a7c080';
                button.style.transform = 'translateY(-1px)';
                button.style.boxShadow = '0 2px 6px rgba(141, 161, 1, 0.3)';
            };
            button.onmouseout = () => {
                button.style.background = color;
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 1px 3px rgba(141, 161, 1, 0.2)';
            };
            
            button.onclick = onclick;
            return button;
        }

        // 标记配置已修改
        const markChangedBtn = createToolbarButton('✏️ 标记已修改', () => {
            log('✏️ 开始使用源码分析结果标记配置为已修改...');
            
            try {
                if (aceEditor) {
                    const content = aceEditor.getValue();
                    const success = setApolloEditState(content);
                    
                    if (success) {
                        showNotification('🎉 已根据Apollo源码设置编辑状态', true);
                    } else {
                        showNotification('⚠️ 设置编辑状态失败，查看控制台了解详情', false);
                    }
                } else {
                    log('❌ 编辑器未找到');
                    showNotification('❌ 编辑器未找到', false);
                }
            } catch (e) {
                log('❌ 标记修改失败:', e.message);
                showNotification('❌ 标记修改失败: ' + e.message, false);
            }
        }, '#8da101');

        // 测试提交修改按钮
        const testCommitBtn = createToolbarButton('🧪 测试提交', () => {
            log('🧪 测试提交修改功能...');
            
            try {
                const committed = autoCommitChanges();
                
                if (committed) {
                    showNotification('✅ 测试提交成功！', true);
                } else {
                    showNotification('❌ 测试提交失败，请查看控制台', false);
                }
            } catch (e) {
                log('❌ 测试提交失败:', e.message);
                showNotification('❌ 测试提交失败: ' + e.message, false);
            }
        }, '#df69ba');

        // 诊断编辑器按钮
        const diagnoseBtn = createToolbarButton('🔍 诊断编辑器', () => {
            log('🔍 开始诊断页面编辑器...');
            
            try {
                // 显示当前点击的namespace信息
                if (currentClickedNamespace) {
                    log('=== 当前点击Namespace信息 ===');
                    log(`🎯 Namespace名称: "${currentClickedNamespace.name}"`);
                    log(`📍 信息来源: ${currentClickedNamespace.source}`);
                    log(`🔗 对象引用: ${currentClickedNamespace.object ? '有' : '无'}`);
                    
                    showNotification(`🎯 当前namespace: ${currentClickedNamespace.name}`, true);
                } else {
                    log('⚠️ 没有保存的点击namespace信息');
                    showNotification('⚠️ 没有namespace信息', false);
                }
                
                // 诊断1: ACE编辑器
                log('=== ACE编辑器诊断 ===');
                if (window.ace) {
                    log('✅ ACE库已加载');
                    
                    const selectors = ['.ace_editor', '#ace-editor', '[class*="ace_editor"]', '.ace-editor', 'div[id*="ace"]'];
                    let totalFound = 0;
                    
                    selectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            log(`🔍 选择器 "${selector}": ${elements.length} 个元素`);
                            elements.forEach((el, i) => {
                                const visible = el.offsetParent !== null;
                                const size = `${el.offsetWidth}x${el.offsetHeight}`;
                                const id = el.id || '(无ID)';
                                const classes = el.className || '(无class)';
                                log(`   元素 ${i}: ID="${id}", class="${classes}", 可见=${visible}, 尺寸=${size}`);
                                
                                try {
                                    const editor = window.ace.edit(el);
                                    if (editor) {
                                        const content = editor.getValue();
                                        log(`   ✅ 可访问ACE编辑器，内容长度: ${content.length}`);
                                        totalFound++;
                                    }
                                } catch (e) {
                                    log(`   ❌ 无法访问ACE编辑器: ${e.message}`);
                                }
                            });
                        }
                    });
                    
                    log(`📊 总共找到 ${totalFound} 个可访问的ACE编辑器`);
                } else {
                    log('❌ ACE库未加载');
                }
                
                // 诊断2: Textarea元素
                log('=== Textarea诊断 ===');
                const textareas = document.querySelectorAll('textarea');
                log(`🔍 找到 ${textareas.length} 个textarea元素`);
                
                textareas.forEach((textarea, i) => {
                    const visible = textarea.offsetParent !== null;
                    const size = `${textarea.offsetWidth}x${textarea.offsetHeight}`;
                    const id = textarea.id || '(无ID)';
                    const name = textarea.name || '(无name)';
                    const valueLength = (textarea.value || '').length;
                    
                    log(`   Textarea ${i}: ID="${id}", name="${name}", 可见=${visible}, 尺寸=${size}, 内容长度=${valueLength}`);
                });
                
                // 诊断3: Angular scope诊断
                log('=== Angular Scope诊断 ===');
                if (window.angular) {
                    log('✅ Angular已加载');
                    
                    let scopeCount = 0;
                    let namespaceCount = 0;
                    
                    const allElements = document.querySelectorAll('*');
                    for (let i = 0; i < Math.min(100, allElements.length); i++) { // 只检查前100个元素
                        try {
                            const scope = window.angular.element(allElements[i]).scope();
                            if (scope) {
                                scopeCount++;
                                if (scope.namespaces || scope.namespace) {
                                    namespaceCount++;
                                    log(`   找到namespace scope: 元素标签=${allElements[i].tagName}`);
                                }
                            }
                        } catch (e) {
                            // 忽略
                        }
                    }
                    
                    log(`📊 检查了 ${Math.min(100, allElements.length)} 个元素，找到 ${scopeCount} 个scope，其中 ${namespaceCount} 个有namespace`);
                } else {
                    log('❌ Angular未加载');
                }
                
                // 诊断4: 编辑器overlay状态
                log('=== 编辑器Overlay诊断 ===');
                log(`编辑器overlay存在: ${!!overlay}`);
                if (overlay) {
                    log(`编辑器父节点: ${overlay.parentNode?.nodeName || '无'}`);
                    log(`编辑器在DOM中: ${document.contains(overlay)}`);
                    log(`编辑器在body中: ${overlay.parentNode === document.body}`);
                    log(`编辑器可见性: ${overlay.style.display !== 'none'}`);
                    log(`编辑器ID: ${overlay.id || '无'}`);
                }
                
                showNotification('🔍 诊断完成，请查看控制台', true);
                
            } catch (e) {
                log('❌ 诊断过程出错:', e.message);
                showNotification('❌ 诊断失败', false);
            }
        }, '#708089');

        // 保存并退出按钮（完整流程）
        const saveAndExitBtn = createToolbarButton('💾 保存并退出', () => {
            try {
                // 安全获取编辑器内容
                let content = '';
                if (aceEditor && aceEditor.getValue) {
                    content = aceEditor.getValue();
                    log(`📝 从全屏编辑器获取内容，类型: ${typeof content}, 长度: ${content ? content.length : 'null'}`);
                    
                    // 详细内容调试
                    if (content === null) {
                        log('❌ 编辑器返回null');
                    } else if (content === undefined) {
                        log('❌ 编辑器返回undefined');
                    } else if (content === '') {
                        log('❌ 编辑器返回空字符串');
                    } else {
                        log(`✅ 编辑器内容有效，前100字符: "${content.substring(0, 100)}"`);
                    }
                } else {
                    log('❌ 全屏编辑器未找到或未初始化');
                    showNotification('❌ 编辑器未初始化', false);
                    return;
                }

                // 严格的内容验证
                if (content === null || content === undefined) {
                    log('❌ 内容为null/undefined，无法保存');
                    showNotification('❌ 编辑器内容异常，请刷新页面重试', false);
                    return;
                }
                
                if (typeof content !== 'string') {
                    log(`❌ 内容类型错误: ${typeof content}，期望string`);
                    showNotification('❌ 编辑器内容类型异常', false);
                    return;
                }

                if (content.trim().length === 0) {
                    log('⚠️ 警告：内容为空字符串，不进行保存');
                    showNotification('⚠️ 内容为空，不会保存', false);
                    return;
                }

                log('💾 开始快速保存流程...');
                log('📄 要保存的内容预览:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));
                
                // 第1步：设置页面编辑器内容
                log('🔄 步骤1: 设置页面编辑器内容');
                const contentSet = setACEEditorContent(content);
                
                if (!contentSet) {
                    showNotification('❌ 设置页面编辑器内容失败', false);
                    return;
                }
                
                // 第2步：设置Apollo编辑状态（减少延迟）
                setTimeout(() => {
                    log('🔄 步骤2: 设置Apollo编辑状态');
                    const stateSet = setApolloEditState(content);
                    
                    if (!stateSet) {
                        showNotification('❌ 设置编辑状态失败', false);
                        return;
                    }
                    
                    // 第3步：快速强制确保内容同步
                    setTimeout(() => {
                        log('🔄 步骤3: 快速内容同步');
                        
                        // 快速强制设置关键字段
                        const allElements = document.querySelectorAll('*');
                        for (let element of allElements) {
                            try {
                                const scope = window.angular.element(element).scope();
                                if (scope) {
                                    // 强制设置所有可能的configText字段
                                    if (scope.namespace) {
                                        scope.namespace.configText = content;
                                        scope.namespace.hasText = true;
                                    }
                                    if (scope.namespaces) {
                                        scope.namespaces.forEach(ns => {
                                            if (ns.isTextEditing) {
                                                ns.configText = content;
                                                ns.hasText = true;
                                            }
                                        });
                                    }
                                    if (scope.item) {
                                        scope.item.value = content;
                                        scope.item.configText = content;
                                    }
                                    scope.configText = content;
                                }
                            } catch (e) {
                                // 忽略错误
                            }
                        }
                        
                        log('✅ 快速内容同步完成，开始提交修改');
                        
                        // 第4步：自动提交修改（减少延迟）
                        setTimeout(() => {
                            log('🔄 步骤4: 自动提交修改');
                            const committed = autoCommitChanges();
                        
                            if (committed) {
                                log('🎉 完整流程成功：内容设置 + 状态设置 + 自动提交');
                                
                                // 第5步：快速关闭全屏编辑器
                                setTimeout(() => {
                                    const closeResult = overlay.safeClose();
                                    log(`🔧 编辑器关闭结果: ${closeResult}`);
                                    
                                    if (closeResult) {
                                        showNotification('✅ 配置已保存，现在可以发布了！', true);
                                    } else {
                                        // 即使关闭异常，配置同步可能已经成功了
                                        log('⚠️ 编辑器关闭异常，但配置同步流程已完成');
                                    }
                                }, 300); // 大幅减少关闭延迟
                            } else {
                                log('⚠️ 自动提交修改失败，但内容和状态已设置');
                                // 即使提交失败，也关闭编辑器
                                setTimeout(() => {
                                    overlay.safeClose();
                                    showNotification('⚠️ 请手动点击"提交修改"', false);
                                }, 300);
                            }
                        }, 200); // 减少提交延迟
                    }, 100); // 大幅减少同步延迟
                }, 100); // 大幅减少状态设置延迟
                
            } catch (e) {
                log('❌ 保存流程失败:', e.message);
                showNotification('❌ 保存流程失败: ' + e.message, false);
            }
        }, '#a7c080');

        // 复制到剪贴板按钮
        const copyBtn = createToolbarButton('📋 复制内容', () => {
            try {
                if (aceEditor && aceEditor.getValue) {
                    const content = aceEditor.getValue();
                    
                    if (!content || content.trim().length === 0) {
                        showNotification('⚠️ 内容为空', false);
                        return;
                    }
                    
                    // 使用现代剪贴板API
                    if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(content).then(() => {
                            showNotification('📋 内容已复制到剪贴板', true);
                            log('✅ 内容已复制到剪贴板');
                        }).catch(err => {
                            log('❌ 复制失败:', err);
                            fallbackCopy(content);
                        });
                    } else {
                        fallbackCopy(content);
                    }
                } else {
                    showNotification('❌ 编辑器未找到', false);
                }
            } catch (e) {
                log('❌ 复制失败:', e.message);
                showNotification('❌ 复制失败', false);
            }
            
            function fallbackCopy(text) {
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    textArea.style.top = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    if (document.execCommand('copy')) {
                        showNotification('📋 内容已复制到剪贴板', true);
                        log('✅ 备用方法复制成功');
                    } else {
                        showNotification('❌ 复制失败，请手动复制', false);
                    }
                    
                    document.body.removeChild(textArea);
                } catch (e) {
                    log('❌ 备用复制方法失败:', e.message);
                    showNotification('❌ 复制失败，请手动选择内容复制', false);
                }
            }
        }, '#35a77c');

        // 设置状态按钮（安全版本）
        const saveBtn = createToolbarButton('🎯 设置编辑状态', () => {
            try {
                // 安全获取编辑器内容
                let content = '';
                if (aceEditor && aceEditor.getValue) {
                    content = aceEditor.getValue();
                    log(`📝 从全屏编辑器获取内容，长度: ${content.length}`);
                } else {
                    log('❌ 全屏编辑器未找到或未初始化');
                    showNotification('❌ 编辑器未初始化', false);
                    return;
                }

                // 检查内容是否为空
                if (!content || content.trim().length === 0) {
                    log('⚠️ 警告：内容为空，不进行保存');
                    showNotification('⚠️ 内容为空，不会保存', false);
                    return;
                }

                log('💾 开始快速保存流程...');
                log('📄 要保存的内容预览:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));
                
                // 设置Apollo编辑状态
                const stateSet = setApolloEditState(content);
                
                if (stateSet) {
                    log('✅ 编辑状态设置完成，开始自动提交修改');
                    
                    // 快速提交修改，减少等待时间
                    setTimeout(() => {
                        const committed = autoCommitChanges();
                        
                        if (committed) {
                            showNotification('✅ 配置已保存，可以发布了！', true);
                            log('🎉 完整流程完成：编辑状态设置 + 自动提交修改');
                        } else {
                            showNotification('⚠️ 请手动点击"提交修改"', false);
                            log('⚠️ 自动提交修改失败，需要手动操作');
                        }
                    }, 200); // 大幅减少等待时间
                } else {
                    log('⚠️ 编辑状态设置过程中遇到问题');
                }
                
            } catch (e) {
                log('❌ 保存失败:', e.message);
                showNotification('❌ 保存失败: ' + e.message, false);
            }
        }, '#a7c080');

        const forceCloseBtn = createToolbarButton('🚪 强制关闭', () => {
            const result = overlay.safeClose();
            if (result) {
                showNotification('✅ 编辑器已强制关闭', true);
            } else {
                showNotification('❌ 强制关闭失败，请刷新页面', false);
            }
        }, '#f85552');

        const cancelBtn = createToolbarButton('❌ 取消', () => {
            overlay.safeClose();
        }, '#9da1aa');

        // 只保留必要的按钮
        buttonContainer.appendChild(saveAndExitBtn);
        buttonContainer.appendChild(cancelBtn);

        toolbar.appendChild(title);
        toolbar.appendChild(buttonContainer);

        // 创建编辑器容器
        const editorContainer = document.createElement('div');
        editorContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 20px;
            gap: 12px;
        `;

        // 创建ACE编辑器容器
        const aceContainer = document.createElement('div');
        aceContainer.id = 'fullscreen-ace-editor';
        aceContainer.style.cssText = `
            flex: 1;
            border: 1px solid #e6dcc6;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(92, 106, 114, 0.1);
        `;

        // 初始化ACE编辑器
        let aceEditor;
        setTimeout(() => {
            if (window.ace) {
                aceEditor = window.ace.edit(aceContainer);
                
                // 自定义Everforest Light主题
                window.ace.define("ace/theme/everforest-light", ["require", "exports", "module", "ace/lib/dom"], function(require, exports, module) {
                    exports.isDark = false;
                    exports.cssClass = "ace-everforest-light";
                    exports.cssText = `
                        .ace-everforest-light .ace_gutter {
                            background: #f4f0d9;
                            color: #a6b0a0;
                            border-right: 1px solid #e6dcc6;
                        }
                        .ace-everforest-light .ace_print-margin {
                            width: 1px;
                            background: #e6dcc6;
                        }
                        .ace-everforest-light {
                            background-color: #fdf6e3;
                            color: #5c6a72;
                        }
                        .ace-everforest-light .ace_cursor {
                            color: #5c6a72;
                        }
                        .ace-everforest-light .ace_marker-layer .ace_selection {
                            background: #e8ddb5;
                        }
                        .ace-everforest-light.ace_multiselect .ace_selection.ace_start {
                            box-shadow: 0 0 3px 0px #fdf6e3;
                        }
                        .ace-everforest-light .ace_marker-layer .ace_step {
                            background: #b8bb26;
                        }
                        .ace-everforest-light .ace_marker-layer .ace_bracket {
                            margin: -1px 0 0 -1px;
                            border: 1px solid #a89984;
                        }
                        .ace-everforest-light .ace_marker-layer .ace_active-line {
                            background: #f4f0d9;
                        }
                        .ace-everforest-light .ace_gutter-active-line {
                            background-color: #e8ddb5;
                        }
                        .ace-everforest-light .ace_marker-layer .ace_selected-word {
                            border: 1px solid #e8ddb5;
                        }
                        .ace-everforest-light .ace_invisible {
                            color: #a89984;
                        }
                        .ace-everforest-light .ace_entity.ace_name.ace_tag,
                        .ace-everforest-light .ace_keyword,
                        .ace-everforest-light .ace_meta.ace_tag,
                        .ace-everforest-light .ace_storage {
                            color: #8da101;
                        }
                        .ace-everforest-light .ace_punctuation,
                        .ace-everforest-light .ace_punctuation.ace_tag {
                            color: #5c6a72;
                        }
                        .ace-everforest-light .ace_constant.ace_character,
                        .ace-everforest-light .ace_constant.ace_language,
                        .ace-everforest-light .ace_constant.ace_numeric,
                        .ace-everforest-light .ace_keyword.ace_other.ace_unit,
                        .ace-everforest-light .ace_support.ace_constant,
                        .ace-everforest-light .ace_variable.ace_parameter {
                            color: #f85552;
                        }
                        .ace-everforest-light .ace_constant.ace_other {
                            color: #fe8019;
                        }
                        .ace-everforest-light .ace_invalid {
                            color: #fdf6e3;
                            background-color: #f85552;
                        }
                        .ace-everforest-light .ace_invalid.ace_deprecated {
                            color: #fdf6e3;
                            background-color: #b57614;
                        }
                        .ace-everforest-light .ace_fold {
                            background-color: #8da101;
                            border-color: #5c6a72;
                        }
                        .ace-everforest-light .ace_entity.ace_name.ace_function,
                        .ace-everforest-light .ace_support.ace_function,
                        .ace-everforest-light .ace_variable {
                            color: #35a77c;
                        }
                        .ace-everforest-light .ace_support.ace_class,
                        .ace-everforest-light .ace_support.ace_type {
                            color: #f57d26;
                        }
                        .ace-everforest-light .ace_heading,
                        .ace-everforest-light .ace_markup.ace_heading,
                        .ace-everforest-light .ace_string {
                            color: #8da101;
                        }
                        .ace-everforest-light .ace_entity.ace_name.ace_tag,
                        .ace-everforest-light .ace_entity.ace_other.ace_attribute-name,
                        .ace-everforest-light .ace_meta.ace_tag,
                        .ace-everforest-light .ace_string.ace_regexp,
                        .ace-everforest-light .ace_variable {
                            color: #35a77c;
                        }
                        .ace-everforest-light .ace_comment {
                            color: #a6b0a0;
                            font-style: italic;
                        }
                        .ace-everforest-light .ace_entity.ace_other.ace_attribute-name {
                            color: #35a77c;
                        }
                        .ace-everforest-light .ace_indent-guide {
                            background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACZgbYnAAAAEklEQVQImWNgYGBgYHB3d/8PAAOIAdULw8qMAAAAAElFTkSuQmCC) right repeat-y;
                        }
                    `;
                    var dom = require("../lib/dom");
                    dom.importCssString(exports.cssText, exports.cssClass);
                });

                aceEditor.setTheme("ace/theme/everforest-light");
                aceEditor.session.setMode("ace/mode/yaml");
                aceEditor.setValue(initialContent);
                aceEditor.clearSelection();
                
                // 配置编辑器
                aceEditor.setOptions({
                    fontSize: 14,
                    showPrintMargin: false,
                    highlightActiveLine: true,
                    enableBasicAutocompletion: true,
                    enableLiveAutocompletion: true,
                    tabSize: 2,
                    useSoftTabs: true,
                    fontFamily: '"Fira Code", "SF Mono", Monaco, Inconsolata, "Ubuntu Mono", Consolas, source-code-pro, Menlo, Monaco, "Courier New", monospace'
                });

                // 消除ACE滚动警告
                aceEditor.$blockScrolling = Infinity;

                // 创建自定义查找面板
                const searchPanel = createSearchPanel(aceEditor);

                // 键盘快捷键
                aceEditor.commands.addCommand({
                    name: 'saveAndClose',
                    bindKey: {win: 'Ctrl-S', mac: 'Command-S'},
                    exec: function(editor) {
                        saveAndExitBtn.click();
                    }
                });

                aceEditor.commands.addCommand({
                    name: 'close',
                    bindKey: {win: 'Escape', mac: 'Escape'},
                    exec: function(editor) {
                        // 如果查找面板打开，先关闭查找面板
                        if (searchPanel && searchPanel.isVisible()) {
                            searchPanel.hide();
                        } else {
                            overlay.safeClose();
                        }
                    }
                });

                // 自定义查找快捷键
                aceEditor.commands.addCommand({
                    name: 'customFind',
                    bindKey: {win: 'Ctrl-F', mac: 'Command-F'},
                    exec: function(editor) {
                        if (searchPanel) {
                            searchPanel.show();
                        }
                    }
                });

                aceEditor.focus();
                log('✅ ACE编辑器初始化完成，已应用Everforest Light主题');
            }
        }, 100);

        // 状态栏
        const statusBar = document.createElement('div');
        statusBar.id = 'fullscreen-status';
        statusBar.style.cssText = `
            background: #f4f0d9;
            color: #708089;
            padding: 10px 20px;
            font-size: 12px;
            font-weight: 500;
            border-top: 1px solid #e6dcc6;
            display: flex;
            justify-content: space-between;
            backdrop-filter: blur(10px);
        `;

        const leftStatus = document.createElement('span');
        leftStatus.textContent = `字符数: ${initialContent.length} | 行数: ${initialContent.split('\n').length}`;
        
        const rightStatus = document.createElement('span');
        rightStatus.textContent = 'Ctrl+S 保存并退出 | Esc 取消';

        statusBar.appendChild(leftStatus);
        statusBar.appendChild(rightStatus);

        editorContainer.appendChild(aceContainer);

        // 组装界面
        overlay.appendChild(toolbar);
        overlay.appendChild(editorContainer);
        overlay.appendChild(statusBar);

        document.body.appendChild(overlay);

        // 添加安全关闭函数到overlay对象
        overlay.safeClose = function() {
            try {
                // 方法1：检查是否在document.body中
                if (overlay && overlay.parentNode === document.body) {
                    document.body.removeChild(overlay);
                    log('✅ 编辑器已安全关闭 (方法1)');
                    return true;
                }
                
                // 方法2：检查是否在DOM中但父节点不是body
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                    log('✅ 编辑器已安全关闭 (方法2)');
                    return true;
                }
                
                // 方法3：使用remove方法
                if (overlay && overlay.remove) {
                    overlay.remove();
                    log('✅ 编辑器已安全关闭 (方法3)');
                    return true;
                }
                
                // 方法4：隐藏元素
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.style.visibility = 'hidden';
                    overlay.style.opacity = '0';
                    overlay.style.pointerEvents = 'none';
                    log('✅ 编辑器已隐藏 (备用方法)');
                    return true;
                }
                
                log('⚠️ 无法找到编辑器overlay元素');
                return false;
                
            } catch (e) {
                log('❌ 关闭编辑器时出错:', e.message);
                // 即使出错也尝试隐藏
                try {
                    if (overlay) {
                        overlay.style.display = 'none';
                        overlay.style.visibility = 'hidden';
                        overlay.style.opacity = '0';
                        overlay.style.pointerEvents = 'none';
                        log('✅ 编辑器已强制隐藏');
                        return true;
                    }
                } catch (hideError) {
                    log('❌ 强制隐藏也失败:', hideError.message);
                }
                return false;
            }
        };

        log('✅ 全屏编辑器创建完成');
        return overlay;
    }

    // 通知函数
    function showNotification(message, isSuccess = true) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${isSuccess ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 1000000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
        `;
        
        // 添加动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                try {
                    if (notification && document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                } catch (e) {
                    // 静默忽略通知移除错误
                    console.debug('通知移除异常:', e.message);
                }
            }, 300);
        }, 1500); // 减少弹窗显示时间从3秒到1.5秒
    }

    // 全局点击拦截器
    function setupGlobalClickInterceptor() {
        log('🛡️ 设置全局点击拦截器...');
        
        // 使用document级别的点击拦截，确保不会遗漏
        document.addEventListener('click', function(e) {
            const target = e.target;
            
            // 调试：记录点击的元素信息（仅在需要时启用）
            // const targetText = target.textContent || target.innerText || '';
            // const targetTitle = target.title || target.getAttribute('data-original-title') || '';
            // const targetTag = target.tagName || '';
            // if (targetText || targetTitle) {
            //     log(`🖱️ 点击检查: ${targetTag}[${targetText || targetTitle}]`);
            // }
            
            // 检查点击的元素或其父元素
            let element = target;
            let depth = 0;
            
            while (element && depth < 5) { // 向上查找5层
                // 检查是否是编辑按钮
                if (isEditButton(element)) {
                    log('🎯 全局拦截到修改配置按钮点击:', element);
                    
                    // ✨ 关键改进：提取点击按钮对应的namespace信息
                    const namespaceInfo = extractNamespaceFromButton(element);
                    if (namespaceInfo) {
                        currentClickedNamespace = namespaceInfo;
                        log(`🎯 ✅ 成功识别点击的namespace: "${namespaceInfo.name}" (来源: ${namespaceInfo.source})`);
                    } else {
                        log('⚠️ 无法识别点击的namespace，将使用默认逻辑');
                        currentClickedNamespace = null;
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // 获取当前内容
                    setTimeout(() => {
                        const currentContent = getACEEditorContent();
                        createFullscreenEditor(currentContent || '# 请在此处编辑您的YAML配置');
                    }, 100);
                    
                    return false;
                }
                
                // 检查是否是发布按钮
                if (isPublishButton(element)) {
                    log('🚀 检测到发布按钮点击，准备增强diff显示:', element);
                    
                    // 不阻止发布按钮的默认行为，让发布窗口正常打开
                    // 然后监听发布窗口中的diff组件
                    setTimeout(() => {
                        log('🔍 开始查找发布窗口中的diff组件...');
                        
                        // 查找diff组件（可能需要等待一段时间让窗口完全加载）
                        let attemptCount = 0;
                        const maxAttempts = 10;
                        
                        function findAndEnhanceDiff() {
                            attemptCount++;
                            const diffElement = document.getElementById('releaseStrDiff');
                            
                            if (diffElement) {
                                log('🎯 找到diff组件，开始增强...');
                                enhanceDiffDisplay(diffElement);
                            } else if (attemptCount < maxAttempts) {
                                log(`🔄 第${attemptCount}次未找到diff组件，继续查找...`);
                                setTimeout(findAndEnhanceDiff, 500);
                            } else {
                                log('⚠️ 达到最大尝试次数，未找到diff组件');
                            }
                        }
                        
                        findAndEnhanceDiff();
                    }, 200);
                    
                    // 不阻止发布按钮的默认行为
                    break;
                }
                
                element = element.parentElement;
                depth++;
            }
        }, true); // 使用捕获阶段，优先级最高
    }

    // 检查是否是编辑按钮
    function isEditButton(element) {
        if (!element) return false;
        
        const text = element.textContent || element.innerText || '';
        const title = element.title || '';
        const onclick = element.getAttribute('onclick') || '';
        const ngClick = element.getAttribute('ng-click') || '';
        const dataOriginalTitle = element.getAttribute('data-original-title') || '';
        const className = element.className || '';
        const src = element.src || '';
        
        // 🚫 首先排除不应该拦截的按钮
        const excludePatterns = [
            // 提交修改相关
            () => text.includes('提交修改'),
            () => text.includes('提交'),
            () => text.includes('确认'),
            () => text.includes('保存'),
            () => ngClick.includes('submitText'),
            () => ngClick.includes('commit'),
            () => ngClick.includes('save'),
            
            // 发布相关
            () => text.includes('发布'),
            () => text.includes('发版'),
            () => ngClick.includes('publish'),
            
            // 其他功能按钮
            () => text.includes('取消'),
            () => text.includes('关闭'),
            () => text.includes('删除'),
            () => text.includes('复制'),
            () => text.includes('下载'),
            () => text.includes('导入'),
            () => text.includes('导出'),
            () => text.includes('刷新'),
            () => text.includes('重置'),
            
            // 导航和菜单
            () => className.includes('navbar'),
            () => className.includes('menu'),
            () => className.includes('dropdown'),
            () => element.tagName === 'A' && text.length < 10, // 短链接文字
        ];
        
        // 检查排除模式
        for (let excludePattern of excludePatterns) {
            try {
                if (excludePattern()) {
                    log(`🚫 排除按钮: ${text || dataOriginalTitle || title || element.tagName}`);
                    return false;
                }
            } catch (e) {
                // 忽略模式检查错误
            }
        }
        
        // ✅ 然后检查应该拦截的编辑按钮
        const includePatterns = [
            // 精确匹配修改配置
            () => dataOriginalTitle === '修改配置',
            () => title === '修改配置', 
            () => text === '修改配置',
            
            // ng-click事件匹配（只针对编辑相关）
            () => ngClick === 'toggleTextEditStatus(namespace)',
            () => ngClick.includes('toggleTextEditStatus'),
            
            // 图片编辑按钮匹配
            () => element.tagName === 'IMG' && src.includes('edit.png') && className.includes('ns_btn'),
            () => element.tagName === 'IMG' && className.includes('ns_btn') && dataOriginalTitle === '修改配置',
            
            // 严格的文本匹配（避免误拦截）
            () => text === '修改配置' && element.tagName === 'BUTTON',
            () => text === '编辑' && element.tagName === 'BUTTON',
            () => dataOriginalTitle === '修改配置' && element.tagName === 'BUTTON',
        ];
        
        for (let includePattern of includePatterns) {
            try {
                if (includePattern()) {
                    log(`✅ 匹配编辑按钮: ${text || dataOriginalTitle || title || element.tagName}[${src}]`);
                    return true;
                }
            } catch (e) {
                // 忽略模式检查错误
            }
        }
        
        return false;
    }

    // 从编辑按钮中提取namespace信息
    function extractNamespaceFromButton(element) {
        log('🔍 开始从按钮元素中提取namespace信息...');
        
        if (!element) {
            log('❌ 按钮元素为空');
            return null;
        }
        
        // 策略1: 从Angular scope中获取namespace信息
        try {
            if (window.angular) {
                const scope = window.angular.element(element).scope();
                if (scope) {
                    // 检查scope.namespace
                    if (scope.namespace && scope.namespace.baseInfo) {
                        const namespaceName = scope.namespace.baseInfo.namespaceName;
                        log(`✅ 策略1成功: 从scope.namespace获取到 "${namespaceName}"`);
                        return {
                            name: namespaceName,
                            object: scope.namespace,
                            source: 'scope.namespace'
                        };
                    }
                    
                    // 检查scope.$parent.namespace
                    if (scope.$parent && scope.$parent.namespace && scope.$parent.namespace.baseInfo) {
                        const namespaceName = scope.$parent.namespace.baseInfo.namespaceName;
                        log(`✅ 策略1成功: 从scope.$parent.namespace获取到 "${namespaceName}"`);
                        return {
                            name: namespaceName,
                            object: scope.$parent.namespace,
                            source: 'scope.$parent.namespace'
                        };
                    }
                    
                    // 检查是否在namespaces数组的上下文中
                    let checkScope = scope;
                    let depth = 0;
                    while (checkScope && depth < 3) {
                        if (checkScope.namespaces && Array.isArray(checkScope.namespaces)) {
                            log(`🔍 在scope层级${depth}找到namespaces数组，包含${checkScope.namespaces.length}个namespace`);
                            
                            // 尝试通过DOM层级关系确定是哪个namespace
                            let currentElement = element;
                            let domDepth = 0;
                            
                            while (currentElement && domDepth < 10) {
                                // 查找包含namespace数据的DOM元素
                                const dataAttrs = currentElement.attributes;
                                if (dataAttrs) {
                                    for (let attr of dataAttrs) {
                                        if (attr.name.includes('namespace') || attr.value.includes('namespace')) {
                                            log(`🔍 找到相关属性: ${attr.name}="${attr.value}"`);
                                        }
                                    }
                                }
                                
                                // 检查ng-repeat等指令
                                const ngRepeat = currentElement.getAttribute('ng-repeat');
                                if (ngRepeat && ngRepeat.includes('namespace')) {
                                    log(`🔍 找到ng-repeat: ${ngRepeat}`);
                                    
                                    // 尝试从元素的Angular scope获取当前namespace
                                    try {
                                        const elementScope = window.angular.element(currentElement).scope();
                                        if (elementScope && elementScope.namespace && elementScope.namespace.baseInfo) {
                                            const namespaceName = elementScope.namespace.baseInfo.namespaceName;
                                            log(`✅ 策略1成功: 从ng-repeat元素scope获取到 "${namespaceName}"`);
                                            return {
                                                name: namespaceName,
                                                object: elementScope.namespace,
                                                source: 'ng-repeat scope'
                                            };
                                        }
                                    } catch (e) {
                                        log(`⚠️ 获取ng-repeat元素scope失败: ${e.message}`);
                                    }
                                }
                                
                                currentElement = currentElement.parentElement;
                                domDepth++;
                            }
                        }
                        checkScope = checkScope.$parent;
                        depth++;
                    }
                }
            }
        } catch (e) {
            log(`❌ 策略1失败: ${e.message}`);
        }
        
        // 策略2: 从DOM结构中推断namespace
        try {
            let currentElement = element;
            let domDepth = 0;
            
            while (currentElement && domDepth < 15) {
                // 查找包含namespace名称的文本内容
                const textContent = currentElement.textContent || '';
                const className = currentElement.className || '';
                const id = currentElement.id || '';
                
                // 检查常见的namespace名称模式
                const namespacePatterns = [
                    /namespace['":][\s]*['"]([^'"]+)['"]/i,
                    /namespaceName['":][\s]*['"]([^'"]+)['"]/i,
                    /"namespaceName":\s*"([^"]+)"/i,
                    /application\.yml?/i,
                    /application\.properties/i,
                ];
                
                for (let pattern of namespacePatterns) {
                    const match = textContent.match(pattern);
                    if (match && match[1]) {
                        log(`✅ 策略2成功: 从DOM文本内容匹配到 "${match[1]}"`);
                        return {
                            name: match[1],
                            object: null,
                            source: 'DOM text pattern'
                        };
                    }
                }
                
                // 检查兄弟元素和相邻元素中的namespace信息
                if (currentElement.previousElementSibling) {
                    const siblingText = currentElement.previousElementSibling.textContent || '';
                    if (siblingText.includes('.yml') || siblingText.includes('.yaml') || siblingText.includes('.properties')) {
                        log(`✅ 策略2成功: 从兄弟元素获取到 "${siblingText.trim()}"`);
                        return {
                            name: siblingText.trim(),
                            object: null,
                            source: 'sibling element'
                        };
                    }
                }
                
                currentElement = currentElement.parentElement;
                domDepth++;
            }
        } catch (e) {
            log(`❌ 策略2失败: ${e.message}`);
        }
        
        // 策略3: 在页面中查找当前活跃的namespace
        try {
            if (window.angular) {
                const allElements = document.querySelectorAll('*');
                let activeNamespaces = [];
                
                for (let i = 0; i < Math.min(50, allElements.length); i++) {
                    try {
                        const scope = window.angular.element(allElements[i]).scope();
                        if (scope && scope.namespace && scope.namespace.baseInfo && scope.namespace.isTextEditing) {
                            activeNamespaces.push({
                                name: scope.namespace.baseInfo.namespaceName,
                                object: scope.namespace,
                                source: 'active editing namespace'
                            });
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                if (activeNamespaces.length === 1) {
                    log(`✅ 策略3成功: 找到唯一活跃编辑namespace "${activeNamespaces[0].name}"`);
                    return activeNamespaces[0];
                } else if (activeNamespaces.length > 1) {
                    log(`⚠️ 策略3发现多个活跃namespace: ${activeNamespaces.map(ns => ns.name).join(', ')}`);
                    // 返回第一个作为默认选择
                    return activeNamespaces[0];
                }
            }
        } catch (e) {
            log(`❌ 策略3失败: ${e.message}`);
        }
        
        log('❌ 所有策略都失败，无法确定namespace');
        return null;
    }

    // 主初始化函数
    async function initialize() {
        try {
            log('🚀 开始初始化...');
            
            // 检查页面类型
            if (!isConfigPage()) {
                log('⏭️ 跳过非Apollo页面');
                return;
            }
            
            // 等待页面加载完成
            if (document.readyState !== 'complete') {
                await waitForCondition(() => document.readyState === 'complete', 10000);
            }
            log('✅ 页面加载完成');
            
            // 等待ACE编辑器加载
            await waitForCondition(() => window.ace, 5000);
            log('✅ ACE编辑器已加载');
            
            // 等待应用初始化
            await new Promise(resolve => setTimeout(resolve, 2000));
            log('⏳ 应用初始化等待完成');
            
            // 设置全局点击拦截器（主要方法）
            log('🔍 设置全局点击拦截器...');
            setupGlobalClickInterceptor();
            
            // 设置发布窗口diff增强监听（已包含样式优化）
            log('🚀 设置发布窗口监听...');
            setupPublishModalEnhancement();
            
            // 额外设置发布模态框样式优化（确保覆盖）
            log('🎨 设置发布模态框样式优化...');
            setupPublishModalStyleOptimization();
            
            log('✅ 拦截系统初始化完成');
            
        } catch (e) {
            error('❌ 初始化失败:', e);
        }
    }

    // 启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // 添加网络请求拦截器来调试configText问题（增强版）
    function setupNetworkInterceptor() {
        log('🕷️ 设置网络请求拦截器...');
        
        // 拦截XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._method = method;
            this._url = url;
            return originalXHROpen.apply(this, [method, url, ...args]);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
            if (this._url && (this._url.includes('modify') || this._url.includes('commit') || this._url.includes('text') || this._url.includes('namespace'))) {
                log(`🌐 拦截XHR请求: ${this._method} ${this._url}`);
                
                // 检查URL是否包含可能导致404的问题
                if (this._url.includes('/item') && this._method === 'PUT') {
                    log(`⚠️ 警告：检测到可能的错误URL模式 - 使用了/item路径而不是/text路径`);
                    log(`🔍 当前点击的namespace: ${currentClickedNamespace ? currentClickedNamespace.name : '未知'}`);
                }
                
                log(`📤 原始请求数据: ${data}`);
                
                if (data) {
                    try {
                        const parsedData = JSON.parse(data);
                        log('📋 解析后的请求数据:');
                        Object.keys(parsedData).forEach(key => {
                            if (key === 'configText') {
                                log(`   - ${key}: ${parsedData[key] ? `"${parsedData[key].substring(0, 100)}..."` : 'null'} (长度: ${parsedData[key] ? parsedData[key].length : 'null'})`);
                            } else {
                                log(`   - ${key}: ${parsedData[key]}`);
                            }
                        });
                        
                        if (!parsedData.configText || parsedData.configText === '') {
                            log('❌ 发现严重问题：configText为空！开始修复...');
                            
                            // 多种方式获取当前内容
                            let currentContent = '';
                            
                            // 方法1：从ACE编辑器获取
                            try {
                                currentContent = getACEEditorContent();
                                log(`🔍 从ACE编辑器获取内容，长度: ${currentContent ? currentContent.length : 'null'}`);
                            } catch (e) {
                                log('⚠️ 从ACE编辑器获取内容失败:', e.message);
                            }
                            
                            // 方法2：从textarea获取
                            if (!currentContent) {
                                try {
                                    const textareas = document.querySelectorAll('textarea[ng-model*="configText"], textarea[ng-model*="text"]');
                                    for (let textarea of textareas) {
                                        if (textarea.value && textarea.value.trim().length > 0) {
                                            currentContent = textarea.value;
                                            log(`🔍 从textarea获取内容，长度: ${currentContent.length}`);
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    log('⚠️ 从textarea获取内容失败:', e.message);
                                }
                            }
                            
                            // 方法3：从Angular scope获取
                            if (!currentContent) {
                                try {
                                    const elements = document.querySelectorAll('[ng-controller], [ng-app], .ng-scope');
                                    for (let element of elements) {
                                        const scope = window.angular.element(element).scope();
                                        if (scope && scope.configText && scope.configText.trim().length > 0) {
                                            currentContent = scope.configText;
                                            log(`🔍 从Angular scope获取内容，长度: ${currentContent.length}`);
                                            break;
                                        }
                                        if (scope && scope.namespace && scope.namespace.configText && scope.namespace.configText.trim().length > 0) {
                                            currentContent = scope.namespace.configText;
                                            log(`🔍 从namespace scope获取内容，长度: ${currentContent.length}`);
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    log('⚠️ 从Angular scope获取内容失败:', e.message);
                                }
                            }
                            
                            if (currentContent && currentContent.trim().length > 0) {
                                parsedData.configText = currentContent;
                                // 确保其他相关字段也正确设置
                                if (!parsedData.configTextType) {
                                    parsedData.configTextType = '0'; // 默认类型
                                }
                                
                                const fixedData = JSON.stringify(parsedData);
                                log(`✅ 已修复configText，新长度: ${currentContent.length}`);
                                log(`📤 修复后的请求数据: ${fixedData.substring(0, 200)}...`);
                                return originalXHRSend.apply(this, [fixedData]);
                            } else {
                                log('❌ 无法获取有效的配置内容，请求可能会失败');
                            }
                        } else {
                            log('✅ configText正常，长度:', parsedData.configText.length);
                        }
                    } catch (e) {
                        log('⚠️ 无法解析请求数据:', e.message);
                        log('⚠️ 原始数据:', data);
                    }
                }
            }
            
            return originalXHRSend.apply(this, [data]);
        };
        
        // 拦截fetch请求
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            if (url && (url.includes('modify') || url.includes('commit') || url.includes('text') || url.includes('namespace'))) {
                log(`🌐 拦截fetch请求: ${url}`);
                log(`📤 fetch选项:`, options);
                
                if (options.body) {
                    try {
                        const parsedData = JSON.parse(options.body);
                        log('📋 Fetch请求数据:');
                        Object.keys(parsedData).forEach(key => {
                            if (key === 'configText') {
                                log(`   - ${key}: ${parsedData[key] ? `"${parsedData[key].substring(0, 100)}..."` : 'null'} (长度: ${parsedData[key] ? parsedData[key].length : 'null'})`);
                            } else {
                                log(`   - ${key}: ${parsedData[key]}`);
                            }
                        });
                        
                        if (!parsedData.configText || parsedData.configText === '') {
                            log('❌ Fetch发现问题：configText为空！开始修复...');
                            
                            const currentContent = getACEEditorContent();
                            if (currentContent && currentContent.trim().length > 0) {
                                parsedData.configText = currentContent;
                                if (!parsedData.configTextType) {
                                    parsedData.configTextType = '0';
                                }
                                options.body = JSON.stringify(parsedData);
                                log(`✅ 已修复fetch configText，新长度: ${currentContent.length}`);
                            }
                        } else {
                            log('✅ Fetch configText正常，长度:', parsedData.configText.length);
                        }
                    } catch (e) {
                        log('⚠️ 无法解析fetch数据:', e.message);
                        log('⚠️ 原始数据:', options.body);
                    }
                }
            }
            
            return originalFetch.apply(this, [url, options]);
        };
        
        log('✅ 网络请求拦截器设置完成');
    }
    
    // 在初始化时设置网络拦截器
    setupNetworkInterceptor();

    log('📝 脚本加载完成，等待页面准备...');

    // 自定义轻量级查找面板，替代复杂的 ACE ext-searchbox
    function createSearchPanel(aceEditor) {
        // 避免重复创建
        if (document.getElementById('apollo-search-panel')) {
            return;
        }
        
        const searchPanel = document.createElement('div');
        searchPanel.id = 'apollo-search-panel';
        searchPanel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #fdf6e3;
            border: 1px solid #e6dcc6;
            border-radius: 6px;
            padding: 10px;
            box-shadow: 0 4px 12px rgba(92, 106, 114, 0.2);
            z-index: 1000001;
            display: none;
            font-family: "SF Mono", Monaco, Inconsolata, "Ubuntu Mono", Consolas, monospace;
            font-size: 13px;
            min-width: 300px;
        `;
        
        searchPanel.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="apollo-search-input" placeholder="查找..." 
                       style="flex: 1; padding: 6px 8px; border: 1px solid #e6dcc6; border-radius: 3px; background: #fdf6e3; color: #5c6a72; outline: none;">
                <button id="apollo-search-close" title="关闭" 
                        style="background: #f85552; color: white; border: none; border-radius: 3px; padding: 6px 10px; cursor: pointer;">×</button>
            </div>
            <div style="display: flex; gap: 6px;">
                <button id="apollo-search-prev" title="上一个 (Shift+Enter)" 
                        style="background: #35a77c; color: white; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 11px;">↑</button>
                <button id="apollo-search-next" title="下一个 (Enter)" 
                        style="background: #35a77c; color: white; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 11px;">↓</button>
                <span id="apollo-search-status" style="margin-left: 8px; color: #708089; font-size: 11px;"></span>
            </div>
        `;
        
        document.body.appendChild(searchPanel);
        
        const searchInput = document.getElementById('apollo-search-input');
        const searchStatus = document.getElementById('apollo-search-status');
        const closeBtn = document.getElementById('apollo-search-close');
        const prevBtn = document.getElementById('apollo-search-prev');
        const nextBtn = document.getElementById('apollo-search-next');
        
        let currentSearchText = '';
        
        // 查找函数
        function performSearch(backwards = false) {
            const searchText = searchInput.value.trim();
            if (!searchText) {
                searchStatus.textContent = '';
                return;
            }
            
            try {
                // 执行查找
                const result = aceEditor.find(searchText, {
                    backwards: backwards,
                    wrap: true,
                    caseSensitive: false,
                    wholeWord: false,
                    regExp: false
                });
                
                if (result) {
                    // 计算总匹配数和当前位置
                    const { currentIndex, totalCount } = calculateSearchStats(searchText);
                    
                    if (totalCount > 0) {
                        searchStatus.textContent = `${currentIndex}/${totalCount}`;
                        searchStatus.style.color = '#35a77c';
                    } else {
                        searchStatus.textContent = '已找到';
                        searchStatus.style.color = '#35a77c';
                    }
                } else {
                    searchStatus.textContent = '未找到';
                    searchStatus.style.color = '#f85552';
                }
            } catch (e) {
                log('搜索出错:', e.message);
                searchStatus.textContent = '搜索出错';
                searchStatus.style.color = '#f85552';
            }
            
            // 更新当前搜索文本
            currentSearchText = searchText;
        }
        
        // 计算搜索统计信息
        function calculateSearchStats(searchText) {
            try {
                const content = aceEditor.getValue();
                const currentPos = aceEditor.getCursorPosition();
                const currentOffset = aceEditor.session.doc.positionToIndex(currentPos);
                
                // 使用正则表达式查找所有匹配项
                const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                const matches = [];
                let match;
                
                while ((match = regex.exec(content)) !== null) {
                    matches.push({
                        index: match.index,
                        length: match[0].length
                    });
                    // 防止无限循环
                    if (match.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                }
                
                const totalCount = matches.length;
                
                if (totalCount === 0) {
                    return { currentIndex: 0, totalCount: 0 };
                }
                
                // 找到当前光标位置对应的匹配项索引
                let currentIndex = 1;
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i].index <= currentOffset && currentOffset <= matches[i].index + matches[i].length) {
                        currentIndex = i + 1;
                        break;
                    } else if (matches[i].index > currentOffset) {
                        currentIndex = i + 1;
                        break;
                    }
                }
                
                // 如果光标在最后一个匹配项之后，显示最后一个
                if (currentIndex > totalCount) {
                    currentIndex = totalCount;
                }
                
                return { currentIndex, totalCount };
            } catch (e) {
                log('计算搜索统计失败:', e.message);
                return { currentIndex: 0, totalCount: 0 };
            }
        }
        
        // 显示搜索面板
        function showSearchPanel() {
            searchPanel.style.display = 'block';
            searchInput.focus();
            searchInput.select();
        }
        
        // 隐藏搜索面板
        function hideSearchPanel() {
            searchPanel.style.display = 'none';
            aceEditor.focus();
            currentSearchText = '';
        }
        
        // 事件绑定
        searchInput.addEventListener('input', () => {
            currentSearchText = ''; // 重置，触发新搜索
            if (searchInput.value.trim()) {
                performSearch();
            } else {
                searchStatus.textContent = '';
            }
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(e.shiftKey); // Shift+Enter 向上搜索
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideSearchPanel();
            }
        });
        
        closeBtn.addEventListener('click', hideSearchPanel);
        prevBtn.addEventListener('click', () => performSearch(true));
        nextBtn.addEventListener('click', () => performSearch(false));
        
        // 点击面板外部关闭
        document.addEventListener('click', (e) => {
            if (!searchPanel.contains(e.target) && searchPanel.style.display === 'block') {
                hideSearchPanel();
            }
        });
        
        // 返回控制函数
        return {
            show: showSearchPanel,
            hide: hideSearchPanel,
            isVisible: () => searchPanel.style.display === 'block'
        };
    }
    
    log('✅ 自定义查找面板准备就绪');

    // 检查是否是发布按钮
    function isPublishButton(element) {
        if (!element) return false;
        
        const text = element.textContent || element.innerText || '';
        const title = element.title || '';
        const dataOriginalTitle = element.getAttribute('data-original-title') || '';
        const ngClick = element.getAttribute('ng-click') || '';
        const className = element.className || '';
        
        // 检查发布按钮的特征
        const publishPatterns = [
            () => text.includes('发布'),
            () => text.includes('发版'),
            () => title.includes('发布'),
            () => dataOriginalTitle.includes('发布'),
            () => ngClick.includes('publish'),
            () => ngClick.includes('release'),
            () => className.includes('publish'),
            () => className.includes('release')
        ];
        
        for (let pattern of publishPatterns) {
            try {
                if (pattern()) {
                    log(`✅ 匹配发布按钮: ${text || dataOriginalTitle || title || element.tagName}`);
                    return true;
                }
            } catch (e) {
                // 忽略模式检查错误
            }
        }
        
        return false;
    }

    // 创建增强的Diff显示器
    function createEnhancedDiffViewer(oldContent, newContent, container) {
        log('🔍 创建增强Diff显示器...');
        
        // 移除原有内容
        container.innerHTML = '';
        
        // 创建diff容器
        const diffContainer = document.createElement('div');
        diffContainer.style.cssText = `
            font-family: 'Fira Code', 'SF Mono', Monaco, Inconsolata, 'Ubuntu Mono', Consolas, monospace;
            font-size: 13px;
            line-height: 1.5;
            background: #fdf6e3;
            border: 1px solid #e6dcc6;
            border-radius: 6px;
            max-height: 500px;
            overflow-y: auto;
            padding: 16px;
        `;
        
        // 使用简单的diff算法
        const diffResult = generateDiff(oldContent, newContent);
        
        diffResult.forEach(line => {
            const lineElement = document.createElement('div');
            lineElement.style.cssText = `
                margin: 2px 0;
                padding: 2px 8px;
                border-radius: 3px;
                white-space: pre-wrap;
                word-break: break-all;
            `;
            
                                     switch (line.type) {
                case 'added':
                    lineElement.style.backgroundColor = '#e8f2e8';
                    lineElement.style.color = '#35a77c';
                    lineElement.style.borderLeft = '3px solid #35a77c';
                    lineElement.style.paddingLeft = '8px';
                    lineElement.textContent = '+ ' + line.content;
                    lineElement.setAttribute('data-change-type', 'added');
                    break;
                case 'removed':
                    lineElement.style.backgroundColor = '#f7e8e8';
                    lineElement.style.color = '#f85552';
                    lineElement.style.borderLeft = '3px solid #f85552';
                    lineElement.style.paddingLeft = '8px';
                    lineElement.textContent = '- ' + line.content;
                    lineElement.setAttribute('data-change-type', 'removed');
                    break;
                case 'unchanged':
                    lineElement.style.color = '#5c6a72';
                    lineElement.style.opacity = '0.7';
                    lineElement.style.paddingLeft = '8px';
                    lineElement.textContent = '  ' + line.content;
                    lineElement.setAttribute('data-change-type', 'unchanged');
                    break;
                case 'modified':
                    lineElement.style.backgroundColor = '#f7f3e8';
                    lineElement.style.color = '#8da101';
                    lineElement.style.borderLeft = '3px solid #8da101';
                    lineElement.style.paddingLeft = '8px';
                    lineElement.textContent = '~ ' + line.content;
                    lineElement.setAttribute('data-change-type', 'modified');
                    break;
            }
            
            diffContainer.appendChild(lineElement);
        });
        
        // 添加工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #f4f0d9;
            border-bottom: 1px solid #e6dcc6;
            border-radius: 6px 6px 0 0;
            font-size: 12px;
            color: #708089;
        `;
        
        // 创建变更统计显示区域
        const leftInfo = document.createElement('div');
        const stats = calculateDiffStats(diffResult);
        leftInfo.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            color: #708089;
            font-size: 12px;
        `;
        
        // 统计信息（不可点击）
        const statsDisplay = document.createElement('span');
        statsDisplay.textContent = `📊 变更统计: +${stats.added} -${stats.removed} ~${stats.modified}`;
        
        // 创建独立的导航按钮组
        const navButtons = document.createElement('div');
        navButtons.style.cssText = `
            display: flex;
            gap: 2px;
            align-items: center;
        `;
        
        // 跳转功能的核心逻辑
        let currentChangeIndex = 0;
        const changeLines = [];
        
                // 精确收集变更行，只收集真正的变更内容
        const collectChangeLines = () => {
            changeLines.length = 0; // 清空数组
            
            // 等待DOM完全渲染后再收集
            setTimeout(() => {
                log('🔍 开始收集变更行...');
                
                const allDivs = diffContainer.querySelectorAll('div');
                log(`📍 找到 ${allDivs.length} 个div元素`);
                
                allDivs.forEach((lineElement, index) => {
                    const text = lineElement.textContent || '';
                    const trimmedText = text.trim();
                    
                    // 调试每个元素的样式和内容
                    if (trimmedText) {
                        const bgColor = lineElement.style.backgroundColor;
                        const borderLeft = lineElement.style.borderLeft;
                        log(`📍 检查元素 ${index}: "${trimmedText.substring(0, 30)}..." | 背景: ${bgColor} | 边框: ${borderLeft}`);
                    }
                    
                    // 精确的变更行识别：只看 data-change-type 属性
                    const hasChangeData = lineElement.getAttribute('data-change-type');
                    const isDirectChild = lineElement.parentElement === diffContainer;
                    
                    // 只收集非 "unchanged" 的行作为变更行
                    if (hasChangeData && hasChangeData !== 'unchanged' && isDirectChild && trimmedText) {
                        // 从data属性确定变更类型
                        let changeType = '?';
                        switch (hasChangeData) {
                            case 'added':
                                changeType = '+';
                                break;
                            case 'removed':
                                changeType = '-';
                                break;
                            case 'modified':
                                changeType = '~';
                                break;
                            default:
                                changeType = hasChangeData.charAt(0);
                        }
                        
                        log(`✅ 确认变更行 ${index}: "${trimmedText}" 类型: ${changeType} (data-change-type: ${hasChangeData})`);
                        
                        changeLines.push({ 
                            element: lineElement, 
                            index: index,
                            type: changeType,
                            lineNumber: index + 1,
                            content: trimmedText,
                            changeType: hasChangeData
                        });
                    }
                });
                
                log(`🔍 收集到 ${changeLines.length} 个确认的变更行`);
                
                // 如果没有收集到变更行，尝试更宽松的条件
                if (changeLines.length === 0) {
                    log('🔄 使用宽松条件重新收集变更行...');
                    
                    allDivs.forEach((lineElement, index) => {
                        const text = lineElement.textContent || '';
                        const trimmedText = text.trim();
                        const hasChangeData = lineElement.getAttribute('data-change-type');
                        const isDirectChild = lineElement.parentElement === diffContainer;
                        
                        // 宽松条件：任何有 data-change-type 属性且不为 "unchanged" 的行
                        if (hasChangeData && hasChangeData !== 'unchanged' && trimmedText && isDirectChild) {
                            let changeType = '?';
                            switch (hasChangeData) {
                                case 'added':
                                    changeType = '+';
                                    break;
                                case 'removed':
                                    changeType = '-';
                                    break;
                                case 'modified':
                                    changeType = '~';
                                    break;
                                default:
                                    changeType = hasChangeData.charAt(0);
                            }
                            
                            log(`✅ 宽松收集变更行 ${index}: "${trimmedText}" 类型: ${changeType} (data-change-type: ${hasChangeData})`);
                            
                            changeLines.push({ 
                                element: lineElement, 
                                index: index,
                                type: changeType,
                                lineNumber: index + 1,
                                content: trimmedText,
                                changeType: hasChangeData
                            });
                        }
                    });
                    
                    log(`🔍 宽松条件收集到 ${changeLines.length} 个变更行`);
                }
                
                // 调试收集结果
                changeLines.forEach((change, idx) => {
                    log(`📋 变更 ${idx + 1}: ${change.type} "${change.content.substring(0, 50)}..."`);
                });
                
                // 更新导航按钮状态
                if (changeLines.length > 0) {
                    prevBtn.disabled = false;
                    nextBtn.disabled = false;
                    positionDisplay.textContent = `1/${changeLines.length}`;
                    currentChangeIndex = 0; // 重置到第一个变更
                    log(`✅ 导航按钮已启用，共 ${changeLines.length} 个变更`);
                } else {
                    prevBtn.disabled = true;
                    nextBtn.disabled = true;
                    positionDisplay.textContent = '0/0';
                    log(`⚠️ 没有找到变更行，导航按钮已禁用`);
                }
                
                // 更新右侧信息
                updateRightInfo();
            }, 500); // 增加等待时间确保样式完全应用
        };
        
        // 上一个变更按钮
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '◀';
        prevBtn.title = '上一个变更 (↑ 或 K)';
        prevBtn.style.cssText = `
            background: #35a77c;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 2px 6px;
            cursor: pointer;
            font-size: 10px;
            line-height: 1;
            transition: all 0.2s ease;
            min-width: 20px;
        `;
        
        // 下一个变更按钮
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '▶';
        nextBtn.title = '下一个变更 (↓ 或 J)';
        nextBtn.style.cssText = `
            background: #35a77c;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 2px 6px;
            cursor: pointer;
            font-size: 10px;
            line-height: 1;
            transition: all 0.2s ease;
            min-width: 20px;
        `;
        
        // 位置显示
        const positionDisplay = document.createElement('span');
        positionDisplay.style.cssText = `
            color: #a6b0a0;
            font-size: 10px;
            min-width: 30px;
            text-align: center;
        `;
        
        // 跳转到指定变更的通用函数
        const jumpToChange = (index) => {
            if (changeLines.length === 0) {
                log('⚠️ 没有可跳转的变更行');
                showLocalNotification('⚠️ 没有找到变更内容', false);
                return;
            }
            
            // 确保索引在有效范围内
            if (index < 0) index = changeLines.length - 1;
            if (index >= changeLines.length) index = 0;
            
            currentChangeIndex = index;
            const targetChange = changeLines[currentChangeIndex];
            
            // 验证目标变更行是否有效
            if (!targetChange.element || !targetChange.element.parentNode) {
                log('❌ 目标变更行无效，重新收集变更行');
                collectChangeLines();
                return;
            }
            
            log(`🎯 跳转到变更行 ${currentChangeIndex + 1}/${changeLines.length}: ${targetChange.type} "${targetChange.content.substring(0, 30)}..."`);
            
            // 移除所有高亮
            changeLines.forEach(change => {
                if (change.element && change.element.style) {
                    change.element.style.outline = 'none';
                    change.element.style.boxShadow = 'none';
                    change.element.style.transform = 'none';
                }
            });
            
            // 高亮当前行 - 使用更明显的视觉效果
            targetChange.element.style.outline = '3px solid #8da101';
            targetChange.element.style.outlineOffset = '2px';
            targetChange.element.style.boxShadow = '0 0 12px rgba(141, 161, 1, 0.5)';
            targetChange.element.style.transform = 'scale(1.02)';
            targetChange.element.style.zIndex = '10';
            targetChange.element.style.position = 'relative';
            
            // 滚动到目标位置
            targetChange.element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
            
            // 更新位置显示
            positionDisplay.textContent = `${currentChangeIndex + 1}/${changeLines.length}`;
            
            // 显示跳转成功的通知
            // showLocalNotification(`🎯 ${targetChange.type === '+' ? '新增' : targetChange.type === '-' ? '删除' : '修改'} (${currentChangeIndex + 1}/${changeLines.length})`, true);
            
            // 3秒后移除高亮
            setTimeout(() => {
                if (targetChange.element && targetChange.element.style) {
                    targetChange.element.style.outline = 'none';
                    targetChange.element.style.boxShadow = 'none';
                    targetChange.element.style.transform = 'none';
                    targetChange.element.style.zIndex = 'auto';
                    targetChange.element.style.position = 'static';
                }
            }, 3000);
        };
        
        // 按钮点击事件 - 使用事件阻止冒泡
        prevBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            jumpToChange(currentChangeIndex - 1);
            return false;
        };
        
        nextBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            jumpToChange(currentChangeIndex + 1);
            return false;
        };
        
                 // 悬停效果和禁用状态
         [prevBtn, nextBtn].forEach(btn => {
             btn.onmouseover = () => {
                 if (!btn.disabled) {
                     btn.style.background = '#a7c080';
                     btn.style.transform = 'scale(1.1)';
                 }
             };
             btn.onmouseout = () => {
                 if (!btn.disabled) {
                     btn.style.background = '#35a77c';
                     btn.style.transform = 'scale(1)';
                 }
             };
             
             // 监听disabled属性变化
             const updateDisabledStyle = () => {
                 if (btn.disabled) {
                     btn.style.background = '#9da1aa';
                     btn.style.cursor = 'not-allowed';
                     btn.style.opacity = '0.6';
                     btn.style.transform = 'scale(1)';
                 } else {
                     btn.style.background = '#35a77c';
                     btn.style.cursor = 'pointer';
                     btn.style.opacity = '1';
                 }
             };
             
             // 初始设置
             updateDisabledStyle();
             
             // 创建属性观察器
             const observer = new MutationObserver(updateDisabledStyle);
             observer.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
         });
        
        // 组装导航按钮
        navButtons.appendChild(prevBtn);
        navButtons.appendChild(positionDisplay);
        navButtons.appendChild(nextBtn);
        
        // 组装完整的左侧信息
        leftInfo.appendChild(statsDisplay);
        leftInfo.appendChild(navButtons);
        
        // 收集变更行
        collectChangeLines();
        
        const rightInfo = document.createElement('span');
        rightInfo.style.cssText = `
            color: #a6b0a0;
            font-size: 11px;
            font-style: italic;
        `;
        
        // 动态更新右侧信息
        const updateRightInfo = () => {
            if (changeLines.length > 0) {
                rightInfo.textContent = `💡 ↑↓/JK 导航 | Home/End 首末 | 点击按钮跳转`;
            } else {
                rightInfo.textContent = `📝 无变更内容`;
            }
        };
        
        // 初始更新
        updateRightInfo();
        
        // 在收集变更行后再次更新
        setTimeout(() => {
            updateRightInfo();
        }, 200);
        
        // 创建本地通知函数（如果全局通知函数不可用）
        const showLocalNotification = (message, isSuccess = true) => {
            if (typeof showNotification === 'function') {
                showNotification(message, isSuccess);
            } else {
                // 创建简单的本地通知
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${isSuccess ? '#35a77c' : '#f85552'};
                    color: white;
                    padding: 8px 16px;
                    border-radius: 4px;
                    z-index: 1000001;
                    font-size: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                `;
                notification.textContent = message;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    if (notification && notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 2000);
            }
        };

        // 添加键盘快捷键支持
        const handleKeydown = (e) => {
            // 检查焦点是否在diff区域或其子元素中
            if (e.target.closest('#releaseStrDiff') || 
                e.target.closest('.modal-content .release') ||
                document.activeElement === document.body) {
                
                if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
                    e.preventDefault();
                    e.stopPropagation();
                    jumpToChange(currentChangeIndex + 1);
                } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    e.stopPropagation();
                    jumpToChange(currentChangeIndex - 1);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    e.stopPropagation();
                    jumpToChange(0); // 跳转到第一个变更
                } else if (e.key === 'End') {
                    e.preventDefault();
                    e.stopPropagation();
                    jumpToChange(changeLines.length - 1); // 跳转到最后一个变更
                }
            }
        };
        
        document.addEventListener('keydown', handleKeydown);
        
        // 清理事件监听器
        container.setAttribute('data-keyboard-listener', 'true');
        container._cleanupKeyboardListener = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
        
        toolbar.appendChild(leftInfo);
        toolbar.appendChild(rightInfo);
        
        // 创建包装容器
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            border: 1px solid #e6dcc6;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(92, 106, 114, 0.1);
        `;
        
        wrapper.appendChild(toolbar);
        wrapper.appendChild(diffContainer);
        container.appendChild(wrapper);
        
        log('✅ 增强Diff显示器创建完成');
        return wrapper;
    }

    // 简单的diff算法
    function generateDiff(oldText, newText) {
        log(`🔍 Diff输入: 旧文本=${oldText ? oldText.length : 'null'}字符, 新文本=${newText ? newText.length : 'null'}字符`);
        
        // 处理空值情况
        if (!oldText) oldText = '';
        if (!newText) newText = '';
        
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const result = [];
        
        log(`📄 行数: 旧=${oldLines.length}, 新=${newLines.length}`);
        
        let oldIndex = 0;
        let newIndex = 0;
        
        while (oldIndex < oldLines.length || newIndex < newLines.length) {
            const oldLine = oldLines[oldIndex];
            const newLine = newLines[newIndex];
            
            if (oldIndex >= oldLines.length) {
                // 只剩新行
                result.push({ type: 'added', content: newLine });
                log(`➕ 新增行: "${newLine}"`);
                newIndex++;
            } else if (newIndex >= newLines.length) {
                // 只剩旧行
                result.push({ type: 'removed', content: oldLine });
                log(`➖ 删除行: "${oldLine}"`);
                oldIndex++;
            } else if (oldLine === newLine) {
                // 相同行 - 只在有实际内容时添加
                if (oldLine.trim() !== '' || result.length === 0 || 
                    (result.length > 0 && result[result.length - 1].type !== 'unchanged')) {
                    result.push({ type: 'unchanged', content: oldLine });
                    log(`⚪ 相同行: "${oldLine}"`);
                }
                oldIndex++;
                newIndex++;
            } else {
                // 查找是否在后续行中有匹配
                let foundInNew = -1;
                let foundInOld = -1;
                
                // 在接下来的5行中查找匹配
                for (let i = 1; i <= 5; i++) {
                    if (newIndex + i < newLines.length && newLines[newIndex + i] === oldLine) {
                        foundInNew = i;
                        break;
                    }
                    if (oldIndex + i < oldLines.length && oldLines[oldIndex + i] === newLine) {
                        foundInOld = i;
                        break;
                    }
                }
                
                if (foundInNew > 0) {
                    // 新增了一些行
                    for (let i = 0; i < foundInNew; i++) {
                        result.push({ type: 'added', content: newLines[newIndex + i] });
                        log(`➕ 新增行: "${newLines[newIndex + i]}"`);
                    }
                    newIndex += foundInNew;
                } else if (foundInOld > 0) {
                    // 删除了一些行
                    for (let i = 0; i < foundInOld; i++) {
                        result.push({ type: 'removed', content: oldLines[oldIndex + i] });
                        log(`➖ 删除行: "${oldLines[oldIndex + i]}"`);
                    }
                    oldIndex += foundInOld;
                } else {
                    // 修改行
                    result.push({ type: 'removed', content: oldLine });
                    result.push({ type: 'added', content: newLine });
                    log(`🔄 修改行: "${oldLine}" -> "${newLine}"`);
                    oldIndex++;
                    newIndex++;
                }
            }
        }
        
        log(`✅ Diff结果: ${result.length} 行差异`);
        return result;
    }

    // 计算diff统计
    function calculateDiffStats(diffResult) {
        const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };
        
        log('🔢 开始计算diff统计...');
        
        let pendingRemoved = [];
        
        diffResult.forEach((line, index) => {
            log(`📊 处理行 ${index}: ${line.type} "${line.content.substring(0, 30)}..."`);
            
            switch (line.type) {
                case 'added':
                    if (pendingRemoved.length > 0) {
                        // 有待处理的删除行，这可能是修改
                        const modifiedCount = Math.min(pendingRemoved.length, 1);
                        const removedCount = Math.max(0, pendingRemoved.length - 1);
                        stats.modified += modifiedCount;
                        stats.removed += removedCount;
                        log(`🔄 修改: +${modifiedCount}, 删除: +${removedCount}`);
                        pendingRemoved = [];
                        // 如果新增行数多于删除行数，剩余的算作新增
                        stats.added += 1;
                        log(`➕ 新增: +1`);
                    } else {
                        stats.added += 1;
                        log(`➕ 新增: +1`);
                    }
                    break;
                case 'removed':
                    pendingRemoved.push(line);
                    log(`🗂️ 暂存删除行: ${pendingRemoved.length}`);
                    break;
                case 'unchanged':
                    // 清理待处理的删除行
                    const removedCount = pendingRemoved.length;
                    stats.removed += removedCount;
                    if (removedCount > 0) {
                        log(`➖ 删除: +${removedCount}`);
                    }
                    pendingRemoved = [];
                    stats.unchanged += 1;
                    log(`⚪ 未变更: +1`);
                    break;
            }
        });
        
        // 处理剩余的删除行
        const finalRemovedCount = pendingRemoved.length;
        stats.removed += finalRemovedCount;
        if (finalRemovedCount > 0) {
            log(`➖ 最终删除: +${finalRemovedCount}`);
        }
        
        log(`📊 最终统计: +${stats.added} -${stats.removed} ~${stats.modified} =${stats.unchanged}`);
        return stats;
    }

    // 监听发布窗口并增强diff显示
    function setupPublishModalEnhancement() {
        log('🚀 设置发布窗口diff增强监听...');
        
        // 使用MutationObserver监听DOM变化
        if (publishModalObserver) {
            publishModalObserver.disconnect();
        }
        
        publishModalObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 查找发布窗口中的diff组件
                        const diffElement = node.querySelector ? node.querySelector('#releaseStrDiff') : null;
                        if (diffElement) {
                            log('🎯 检测到发布窗口diff组件，开始增强...');
                            enhanceDiffDisplay(diffElement);
                        }
                        
                        // 也检查node本身是否是diff组件
                        if (node.id === 'releaseStrDiff') {
                            log('🎯 检测到发布窗口diff组件(直接)，开始增强...');
                            enhanceDiffDisplay(node);
                        }
                        
                        // 检查是否是发布模态框，如果是则应用样式优化
                        const publishModal = node.querySelector ? node.querySelector('.modal-content .release') : null;
                        if (publishModal) {
                            log('🎯 检测到发布模态框，应用样式优化...');
                            setTimeout(() => {
                                optimizePublishModalStyle();
                            }, 100);
                        }
                        
                        // 也检查node本身是否是模态框
                        if (node.classList && (node.classList.contains('modal') || node.classList.contains('modal-content'))) {
                            const releaseContent = node.querySelector('.release');
                            if (releaseContent) {
                                log('🎯 检测到发布模态框(直接)，应用样式优化...');
                                setTimeout(() => {
                                    optimizePublishModalStyle();
                                }, 100);
                            }
                        }
                    }
                });
            });
        });
        
        // 监听整个document的变化
        publishModalObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 也检查已存在的diff组件
        const existingDiff = document.getElementById('releaseStrDiff');
        if (existingDiff) {
            log('🎯 发现已存在的diff组件，开始增强...');
            enhanceDiffDisplay(existingDiff);
        }
        
        // 也检查已存在的发布模态框
        const existingModal = document.querySelector('.modal-content .release');
        if (existingModal) {
            log('🎯 发现已存在的发布模态框，应用样式优化...');
            optimizePublishModalStyle();
        }
        
        log('✅ 发布窗口diff增强监听已设置');
    }

    // 增强diff显示
    function enhanceDiffDisplay(diffElement) {
        if (!diffElement || diffEnhancementActive) {
            log('⚠️ diff组件不存在或增强已激活');
            return;
        }
        
        diffEnhancementActive = true;
        log('🔧 开始增强diff显示...');
        
        try {
            // 等待一下确保数据加载完成
            setTimeout(() => {
                try {
                                    // 从Angular scope获取oldValue和newValue
                if (window.angular) {
                    log('🔍 开始从Angular scope获取diff数据...');
                    
                    let scope = window.angular.element(diffElement).scope();
                    let oldValue = '';
                    let newValue = '';
                    let dataFound = false;
                    
                    // 策略1: 从diffElement的scope获取
                    if (scope && scope.item) {
                        oldValue = scope.item.oldValue || '';
                        newValue = scope.item.newValue || '';
                        
                        log(`📄 策略1 - 直接scope: 旧=${oldValue.length}字符, 新=${newValue.length}字符`);
                        
                        if (oldValue || newValue) {
                            dataFound = true;
                        }
                    }
                    
                    // 策略2: 从父级scope获取
                    if (!dataFound && scope && scope.$parent) {
                        let parentScope = scope.$parent;
                        let depth = 0;
                        
                        while (parentScope && depth < 5) {
                            if (parentScope.item && (parentScope.item.oldValue || parentScope.item.newValue)) {
                                oldValue = parentScope.item.oldValue || '';
                                newValue = parentScope.item.newValue || '';
                                log(`📄 策略2 - 父级scope(${depth}): 旧=${oldValue.length}字符, 新=${newValue.length}字符`);
                                dataFound = true;
                                break;
                            }
                            parentScope = parentScope.$parent;
                            depth++;
                        }
                    }
                    
                    // 策略3: 从发布模态框scope获取
                    if (!dataFound) {
                        const modalElements = document.querySelectorAll('.modal-content .release, .modal .release');
                        for (let modalEl of modalElements) {
                            try {
                                const modalScope = window.angular.element(modalEl).scope();
                                if (modalScope && modalScope.toReleaseNamespace && modalScope.toReleaseNamespace.items) {
                                    const items = modalScope.toReleaseNamespace.items;
                                    log(`📄 策略3 - 模态框scope: 找到${items.length}个items`);
                                    
                                    for (let item of items) {
                                        if (item.oldValue || item.newValue) {
                                            oldValue = item.oldValue || '';
                                            newValue = item.newValue || '';
                                            log(`📄 策略3成功: 旧=${oldValue.length}字符, 新=${newValue.length}字符`);
                                            dataFound = true;
                                            break;
                                        }
                                    }
                                    
                                    if (dataFound) break;
                                }
                            } catch (e) {
                                log(`⚠️ 策略3错误: ${e.message}`);
                            }
                        }
                    }
                    
                    // 策略4: 从页面所有scope中搜索
                    if (!dataFound) {
                        log('🔍 策略4: 在页面所有scope中搜索diff数据...');
                        const allElements = document.querySelectorAll('[ng-controller], [ng-app], .ng-scope');
                        
                        for (let i = 0; i < Math.min(20, allElements.length); i++) {
                            try {
                                const elementScope = window.angular.element(allElements[i]).scope();
                                if (elementScope && elementScope.item && (elementScope.item.oldValue || elementScope.item.newValue)) {
                                    oldValue = elementScope.item.oldValue || '';
                                    newValue = elementScope.item.newValue || '';
                                    log(`📄 策略4成功: 旧=${oldValue.length}字符, 新=${newValue.length}字符`);
                                    dataFound = true;
                                    break;
                                }
                            } catch (e) {
                                // 忽略错误
                            }
                        }
                    }
                    
                    // 显示获取到的数据内容预览
                    if (dataFound) {
                        log(`📄 旧内容预览: "${oldValue.substring(0, 100)}${oldValue.length > 100 ? '...' : ''}"`);
                        log(`📄 新内容预览: "${newValue.substring(0, 100)}${newValue.length > 100 ? '...' : ''}"`);
                        
                        // 创建增强的diff显示
                        createEnhancedDiffViewer(oldValue, newValue, diffElement);
                        log('🎉 diff显示增强完成');
                    } else {
                        log('⚠️ 所有策略都未获取到有效的diff数据');
                        
                        // 最后尝试：使用空数据创建diff显示，看看是否是数据问题
                        log('🔄 使用示例数据创建diff显示用于调试...');
                        createEnhancedDiffViewer(
                            'logstore: k8s-pods\n  redis:\n    host: old-host\n    port: 6379',
                            'logstore: k8s-pods\n  redis:\n    host: new-host\n    port: 6379',
                            diffElement
                        );
                    }
                } else {
                    log('❌ Angular未加载');
                }
                } catch (e) {
                    log('❌ 增强diff显示失败:', e.message);
                } finally {
                    // 重置状态，允许后续增强
                    setTimeout(() => {
                        diffEnhancementActive = false;
                    }, 1000);
                }
            }, 500);
            
        } catch (e) {
            log('❌ 设置diff增强失败:', e.message);
            diffEnhancementActive = false;
        }
    }

    // 优化发布模态框样式
    function optimizePublishModalStyle() {
        log('🎨 开始优化发布模态框样式...');
        
        // 创建样式标签
        const styleId = 'apollo-publish-modal-style';
        let existingStyle = document.getElementById(styleId);
        
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 隐藏 Release Name 字段 */
            .modal-content .form-group:has(label:contains("Release Name")),
            .modal-content .form-group:has(input[ng-model="toReleaseNamespace.releaseTitle"]) {
                display: none !important;
            }
            
            /* 隐藏 Comment 字段 */
            .modal-content .form-group:has(label:contains("Comment")),
            .modal-content .form-group:has(textarea[ng-model="releaseComment"]) {
                display: none !important;
            }
            
            /* 使用更通用的选择器隐藏这些字段 */
            .modal-content .release .form-group:nth-last-child(2),
            .modal-content .release .form-group:nth-last-child(1) {
                display: none !important;
            }
            
                         /* 优化查看变更文本框样式 - 去除空隙 */
             .modal-content .release .pre-scrollable {
                 max-height: none !important;
                 height: auto !important;
                 padding: 0 !important;
                 margin: 0 !important;
             }
             
             /* 优化 diff 显示区域 - 纯净白色无边框 */
             .modal-content #releaseStrDiff {
                 width: 100% !important;
                 max-width: none !important;
                 height: 100% !important;
                 max-height: none !important;
                 margin: 0 !important;
                 padding: 20px !important;
                 border: none !important;
                 border-radius: 0 !important;
                 background: #ffffff !important;
                 font-family: 'Fira Code', 'SF Mono', Monaco, Inconsolata, 'Ubuntu Mono', Consolas, monospace !important;
                 font-size: 13px !important;
                 line-height: 1.6 !important;
                 overflow-y: auto !important;
                 box-shadow: none !important;
                 flex: 1 !important;
                 position: relative !important;
             }
            
                         /* 调整包含 diff 的容器 - 紧凑布局 */
             .modal-content .release .col-sm-10 {
                 width: 100% !important;
                 max-width: none !important;
                 flex: 1 !important;
                 display: flex !important;
                 flex-direction: column !important;
                 padding: 0 !important;
                 margin: 0 !important;
             }
             
             /* 隐藏左侧的按钮组，让diff占满宽度 */
             .modal-content .release .col-sm-2 {
                 display: none !important;
             }
             
             /* 优化模态框整体布局 - 完全去除内边距 */
             .modal-content .release {
                 display: flex !important;
                 flex-direction: column !important;
                 padding: 0 !important;
                 margin: 0 !important;
                 height: calc(100% - 60px) !important; /* 减去按钮组高度 */
             }
             
             /* 优化表单组容器，去除多余空隙 */
             .modal-content .release .form-group.pre-scrollable {
                 margin: 0 !important;
                 padding: 0 !important;
                 flex: 1 !important;
                 display: flex !important;
                 flex-direction: column !important;
             }
            
                         /* 优化按钮组样式 - 现代风格 */
             .modal-content .btn-group {
                 margin: 0 !important;
                 align-self: center !important;
                 box-shadow: 0 1px 3px rgba(92, 106, 114, 0.1) !important;
                 border-radius: 6px !important;
                 overflow: hidden !important;
             }
             
             /* 美化按钮组内的按钮 */
             .modal-content .btn-group .btn {
                 border: none !important;
                 padding: 8px 16px !important;
                 font-size: 13px !important;
                 font-weight: 500 !important;
                 transition: all 0.2s ease !important;
                 background: #f4f0d9 !important;
                 color: #708089 !important;
                 border-radius: 0 !important;
             }
             
             /* 激活状态的按钮 */
             .modal-content .btn-group .btn.active {
                 background: #8da101 !important;
                 color: #fdf6e3 !important;
                 box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1) !important;
             }
             
             /* 按钮悬停效果 */
             .modal-content .btn-group .btn:hover:not(.active) {
                 background: #e8ddb5 !important;
                 color: #5c6a72 !important;
             }
             
             /* 优化按钮组所在的行 - 完全去除空隙 */
             .modal-content .release .btn-group-xs {
                 margin: 0 !important;
                 padding: 0 !important;
             }
             
             /* 优化按钮组容器 */
             .modal-content .release .col-sm-2.control-label {
                 margin: 0 !important;
                 padding: 5px 0 !important;
                 background: #f8f5f0 !important;
                 border-bottom: 1px solid #e6dcc6 !important;
             }
             
             /* 优化整个模态框内容区域 - 去除所有内边距 */
             .modal-content .modal-body {
                 padding: 0 !important;
                 margin: 0 !important;
                 height: 70vh !important;
                 display: flex !important;
                 flex-direction: column !important;
             }
            
                         /* 只隐藏"发布的值"视图中的textarea，保留diff显示 */
             .modal-content .release div[ng-show="releaseChangeViewType=='release'"] {
                 display: none !important;
             }
             
             /* 隐藏包含textarea但不包含diff的容器 */
             .modal-content .release textarea.form-control:not(#releaseStrDiff) {
                 display: none !important;
             }
             
             /* 精确隐藏第二个ng-repeat项（textarea容器） */
             .modal-content .release div[ng-repeat="item in toReleaseNamespace.items"]:nth-child(2) {
                 display: none !important;
             }
            
            /* 优化模态框宽度，让内容有更多空间 */
            .modal-dialog {
                width: 90% !important;
                max-width: 1200px !important;
                margin: 30px auto !important;
            }
            
            /* 确保模态框内容居中 */
            .modal-content .release .ng-scope {
                width: 100% !important;
                display: flex !important;
                justify-content: center !important;
            }
            
            /* 针对具体的 div 容器优化 */
            .modal-content .release .form-group.pre-scrollable .col-sm-10 {
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            
                         /* 隐藏"配置没有变化"等提示信息的额外样式 */
             .modal-content .col-sm-5.form-group .form-control-static {
                 text-align: center !important;
                 font-size: 16px !important;
                 color: #708089 !important;
                 margin: 40px 0 !important;
             }
             
             /* 确保diff显示区域可见且优化 */
             .modal-content #releaseStrDiff {
                 display: block !important;
                 visibility: visible !important;
             }
             
             /* 确保包含diff的容器可见 */
             .modal-content .release div[ng-show="releaseChangeViewType=='change'"] {
                 display: block !important;
                 visibility: visible !important;
             }
             
             /* 只隐藏"发布的值"相关的textarea */
             .modal-content textarea[ng-bind="item.newValue"] {
                 display: none !important;
             }
             
             /* 清理所有可能的容器空隙 */
             .modal-content .release > div,
             .modal-content .release .row,
             .modal-content .release .form-group {
                 margin: 0 !important;
                 padding: 0 !important;
             }
             
             /* 专门优化包含按钮组的容器 - 清爽设计 */
             .modal-content .release > .form-group.pre-scrollable > .col-sm-2.control-label {
                 padding: 16px 0 !important;
                 margin: 0 !important;
                 border-bottom: 1px solid #e6dcc6 !important;
                 background: #fafaf7 !important;
                 display: flex !important;
                 justify-content: center !important;
                 align-items: center !important;
                 position: relative !important;
             }
             
             /* 添加微妙的装饰线 */
             .modal-content .release > .form-group.pre-scrollable > .col-sm-2.control-label::before {
                 content: '' !important;
                 position: absolute !important;
                 top: 0 !important;
                 left: 0 !important;
                 right: 0 !important;
                 height: 1px !important;
                 background: linear-gradient(to right, transparent, #e6dcc6, transparent) !important;
             }
             
             /* 确保diff容器充分利用空间 */
             .modal-content .release .col-sm-10.ng-scope {
                 height: 100% !important;
                 display: flex !important;
                 flex-direction: column !important;
                 padding: 0 !important;
                 margin: 0 !important;
             }
             
             /* 美化模态框头部 */
             .modal-content .modal-header {
                 padding: 15px 20px !important;
                 margin: 0 !important;
                 background: #fafaf7 !important;
                 border-bottom: 1px solid #e6dcc6 !important;
                 border-radius: 6px 6px 0 0 !important;
             }
             
             /* 美化模态框底部 */
             .modal-content .modal-footer {
                 margin: 0 !important;
                 padding: 12px 20px !important;
                 background: #fafaf7 !important;
                 border-top: 1px solid #e6dcc6 !important;
                 border-radius: 0 0 6px 6px !important;
             }
             
             /* 优化模态框整体外观 */
             .modal-content {
                 border: 1px solid #e6dcc6 !important;
                 border-radius: 8px !important;
                 box-shadow: 0 4px 20px rgba(92, 106, 114, 0.15) !important;
                 overflow: hidden !important;
             }
             
             /* 发布按钮样式优化 */
             .modal-footer .btn-primary {
                 background: #8da101 !important;
                 border-color: #8da101 !important;
                 color: #fdf6e3 !important;
                 padding: 8px 20px !important;
                 border-radius: 5px !important;
                 font-weight: 500 !important;
                 transition: all 0.2s ease !important;
             }
             
             .modal-footer .btn-primary:hover {
                 background: #a7c080 !important;
                 border-color: #a7c080 !important;
                 transform: translateY(-1px) !important;
                 box-shadow: 0 2px 8px rgba(141, 161, 1, 0.3) !important;
             }
        `;
        
        document.head.appendChild(style);
        log('✅ 发布模态框样式优化完成');
    }

    // 监听发布模态框并应用样式优化
    function setupPublishModalStyleOptimization() {
        log('🎨 设置发布模态框样式优化监听...');
        
        // 创建样式观察器
        const styleObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 检查是否是发布模态框
                        const publishModal = node.querySelector ? node.querySelector('.modal-content .release') : null;
                        if (publishModal) {
                            log('🎯 检测到发布模态框，应用样式优化...');
                            setTimeout(() => {
                                optimizePublishModalStyle();
                            }, 100);
                        }
                        
                        // 也检查node本身是否是模态框
                        if (node.classList && (node.classList.contains('modal') || node.classList.contains('modal-content'))) {
                            const releaseContent = node.querySelector('.release');
                            if (releaseContent) {
                                log('🎯 检测到发布模态框(直接)，应用样式优化...');
                                setTimeout(() => {
                                    optimizePublishModalStyle();
                                }, 100);
                            }
                        }
                    }
                });
            });
        });
        
        // 监听整个document的变化
        styleObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 也检查已存在的发布模态框
        const existingModal = document.querySelector('.modal-content .release');
        if (existingModal) {
            log('🎯 发现已存在的发布模态框，应用样式优化...');
            optimizePublishModalStyle();
        }
        
        log('✅ 发布模态框样式优化监听已设置');
    }

})(); 