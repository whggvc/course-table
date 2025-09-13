// ==UserScript==
// @name         个性化-课表
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Combine modify uni - view and popup with course detail modification
// @author       everyone
// @match        https://xs.whggvc.net/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 保存修改样式所需的元素选择器和默认样式值
    const styleSettings = [
        { label: '教室文字margin-top', selector: 'span:nth-of-type(1)', defaultValue: '-15px' },
        { label: '教室文字字体大小', selector: 'span:nth-of-type(1)', defaultValue: '15px' },
        { label: '星期与之周margin-top', selector: 'span:nth-of-type(2)', defaultValue: '-15px' },
        { label: '星期与之周字体大小', selector: 'span:nth-of-type(2)', defaultValue: '10px' },
        { label: '教师名字margin-top', selector: 'span:nth-of-type(3)', defaultValue: '-16px' },
        { label: '教师名字字体大小', selector: 'span:nth-of-type(3)', defaultValue: '12px' },
        { label: '年月日时间margin-top', selector: 'span:nth-of-type(4)', defaultValue: '-16px' },
        { label: '年月日时间字体大小', selector: 'span:nth-of-type(4)', defaultValue: '8px' }
    ];

    // 存储当前周次信息的键名
    const CURRENT_WEEK_KEY = 'current_week_number';
    // 存储课程数据哈希的键名前缀
    const COURSE_DATA_HASH_PREFIX = 'course_data_hash_';

    // 在第二段脚本中的代码
    const originalXhr = window.XMLHttpRequest;

    function extractToken(allHeaders) {
        const headersArray = allHeaders.split('\n');
        for (let i = 0; i < headersArray.length; i++) {
            const header = headersArray[i].trim();
            if (header.startsWith('Authorization: ')) {
                return header.split(': ')[1];
            }
        }
        return null;
    }

    // 计算简单的字符串哈希值
    function simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    // 为课程生成唯一标识符
    function generateCourseKey(weekDay, lesson) {
        return `${weekDay}_${lesson}`;
    }

    // 检查课程数据是否变化
    function hasCourseDataChanged(courseKey, courseData) {
        const dataString = JSON.stringify(courseData);
        const newHash = simpleHash(dataString);
        const oldHash = localStorage.getItem(COURSE_DATA_HASH_PREFIX + courseKey);
        
        if (oldHash !== newHash) {
            localStorage.setItem(COURSE_DATA_HASH_PREFIX + courseKey, newHash);
            return true;
        }
        return false;
    }

    function processCourseData(dataArray) {
        const processedData = [];
        
        // 检查是否有周次信息，并更新存储的当前周次
        if (dataArray.length > 0 && dataArray[0].nowweek) {
            const newWeekNumber = dataArray[0].nowweek;
            const oldWeekNumber = localStorage.getItem(CURRENT_WEEK_KEY);
            
            if (oldWeekNumber !== newWeekNumber.toString()) {
                console.log(`周次已变化: 从第${oldWeekNumber}周变为第${newWeekNumber}周，将强制更新所有课程信息`);
                localStorage.setItem(CURRENT_WEEK_KEY, newWeekNumber.toString());
                // 清除所有课程数据哈希值，强制更新所有课程信息
                clearAllCourseDataHashes();
            }
        }
        
        dataArray.forEach(item => {
            console.log('当前处理的数据项:', item);
            const weekNumber = item.nowweek? `第${item.nowweek}周` : '未提供周数信息';
            const weekDay = item.week? `星期${item.week}` : '未提供星期信息';
            const lessonRange = [];
            if (typeof item.startLessonScope === 'number' && typeof item.endLessonScope === 'number') {
                for (let i = item.startLessonScope; i <= item.endLessonScope; i++) {
                    lessonRange.push(i);
                }
            }
            const lessonStr = lessonRange.join('、');
            const classroom = item.classroomName? item.classroomName.replace('藏龙岛 ', '') : '未提供教室信息';
            const teacher = item.teacherNames? item.teacherNames.split('（')[0] : '未提供教师信息';
            const date = item.shortDate? item.shortDate : '未提供日期信息';
            const course = item.courseName? item.courseName : '未提供课程信息';

            let formattedClassroom;
            const match = classroom.match(/(\d+)教J(\d+)/);
            if (match) {
                formattedClassroom = `${match[1]}-${match[2]}`;
            } else {
                const otherMatch = classroom.match(/综([a-zA-Z]?)(\d+)/);
                if (otherMatch) {
                    formattedClassroom = `综${otherMatch[2]}`;
                } else {
                    formattedClassroom = classroom;
                }
            }

            const weekDayNumber = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7 }[item.week];
            const weekAndDay = weekDayNumber? `${weekDayNumber}-${weekNumber.match(/\d+/)[0]}` : '未识别周几';

            const locators = lessonRange.map(lesson => {
                const weekDayIndex = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7 }[item.week];
                if (!weekDayIndex) {
                    console.error(`无法根据周几 ${item.week} 生成索引，跳过该定位路径生成`);
                    return '无法生成定位路径';
                }
                
                // 为每个课程位置生成唯一标识符
                const courseKey = generateCourseKey(weekDayIndex, lesson);
                
                // 创建课程数据对象，用于检测变化
                const courseData = {
                    classroom,
                    teacher,
                    date,
                    course,
                    weekNumber
                };
                
                // 检查课程数据是否变化
                const hasChanged = hasCourseDataChanged(courseKey, courseData);
                
                return {
                    path: `body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.timetable > uni-view.main > uni-view.course-container > uni-view:nth-child(${weekDayIndex}) > uni-view:nth-child(${lesson}) > uni-view > uni-view`,
                    hasChanged: hasChanged
                };
            });

            console.log(`数据归属信息：
周数：${weekNumber}
周几：${weekDay}
课程：${course}
第几节课：第${lessonStr}节
教室：${classroom}
老师：${teacher}
日期：${date}
定位路径：${locators.map(l => typeof l === 'string' ? l : l.path)}`);

            processedData.push({
                weekNumber,
                weekDay,
                course,
                lessonStr,
                classroom,
                teacher,
                date,
                locators,
                formattedClassroom,
                weekAndDay
            });
        });
        return processedData;
    }

    // 添加清除所有自定义课程信息的函数
    function clearAllCustomCourseInfo() {
        const customInfoElements = document.querySelectorAll('.custom-course-info');
        customInfoElements.forEach(element => {
            element.remove();
        });
        console.log('已清除所有自定义课程信息');
    }

    // 清除所有课程数据哈希值
    function clearAllCourseDataHashes() {
        // 获取所有localStorage中的键
        const keys = Object.keys(localStorage);
        // 筛选出课程数据哈希的键
        const hashKeys = keys.filter(key => key.startsWith(COURSE_DATA_HASH_PREFIX));
        // 删除所有课程数据哈希
        hashKeys.forEach(key => localStorage.removeItem(key));
        console.log(`已清除${hashKeys.length}个课程数据哈希值`);
    }

    function modifyPageElements(processedData) {
        const weekDayChineseMap = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '日' };
        processedData.forEach(data => {
            data.locators.forEach(locator => {
                // 适配新的locator格式
                const locatorPath = typeof locator === 'string' ? locator : locator.path;
                const hasChanged = typeof locator === 'object' ? locator.hasChanged : true;
                
                console.log('尝试定位的路径:', locatorPath);
                if (locatorPath === '无法生成定位路径') {
                    return;
                }
                
                // 如果数据没有变化，可以跳过更新
                if (!hasChanged) {
                    console.log('课程数据未变化，跳过更新');
                    return;
                }
                
                const targetElement = document.querySelector(locatorPath);
                if (targetElement) {
                    // 移除旧的自定义课程信息，确保始终更新
                    const oldCustomInfo = targetElement.querySelector('.custom-course-info');
                    if (oldCustomInfo) {
                        oldCustomInfo.remove();
                    }

                    const [weekDayNumber, weekNumberPart] = data.weekAndDay.split('-');
                    const weekDayChinese = weekDayChineseMap[weekDayNumber] || '未识别周几';
                    const newWeekAndDay = `${weekDayChinese}-${weekNumberPart}`;

                    const newContent = `
                        <div class="custom-course-info">
                            <br>
                            <span style="display: block; margin-top: ${getSettingValue('教室文字margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('教室文字字体大小')};font-weight: bold;">${data.formattedClassroom}</span>
                            <br>
                            <span style="display: block; margin-top: ${getSettingValue('星期与之周margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('星期与之周字体大小')};">${newWeekAndDay}</span>
                            <br>
                            <span style="display: block; margin-top: ${getSettingValue('教师名字margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('教师名字字体大小')};">${data.teacher}</span>
                            <br>
                            <span style="display: block; margin-top: ${getSettingValue('年月日时间margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('年月日时间字体大小')};">${data.date}</span>
                        </div>
                    `;

                    // 使用 insertAdjacentHTML 插入新内容，避免覆盖原有内容
                    targetElement.insertAdjacentHTML('beforeend', newContent);
                    console.log("元素已成功修改");
                } else {
                    try {
                        const observer = new MutationObserver((mutationsList) => {
                            for (const mutation of mutationsList) {
                                if (mutation.type === 'childList') {
                                    const element = document.querySelector(locatorPath);
                                    if (element) {
                                        observer.disconnect();
                                        
                                        // 移除旧的自定义课程信息，确保始终更新
                                        const oldCustomInfo = element.querySelector('.custom-course-info');
                                        if (oldCustomInfo) {
                                            oldCustomInfo.remove();
                                        }

                                        const [weekDayNumber, weekNumberPart] = data.weekAndDay.split('-');
                                        const weekDayChinese = weekDayChineseMap[weekDayNumber] || '未识别周几';
                                        const newWeekAndDay = `${weekDayChinese}-${weekNumberPart}`;

                                        const newContent = `
                                            <div class="custom-course-info">
                                                <br>
                                                <span style="display: block; margin-top: ${getSettingValue('教室文字margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('教室文字字体大小')};font-weight: bold;">${data.formattedClassroom}</span>
                                                <br>
                                                <span style="display: block; margin-top: ${getSettingValue('星期与之周margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('星期与之周字体大小')};">${newWeekAndDay}</span>
                                                <br>
                                                <span style="display: block; margin-top: ${getSettingValue('教师名字margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('教师名字字体大小')};">${data.teacher}</span>
                                                <br>
                                                <span style="display: block; margin-top: ${getSettingValue('年月日时间margin-top')}; font-family: Arial, sans-serif; color: white;font-size: ${getSettingValue('年月日时间字体大小')};">${data.date}</span>
                                            </div>
                                        `;

                                        element.insertAdjacentHTML('beforeend', newContent);
                                        console.log("元素已成功修改");
                                        break;
                                    }
                                }
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    } catch (error) {
                        console.error('修改页面元素时出错:', error);
                    }
                }
            });
        });
    }

    window.XMLHttpRequest = function () {
        const xhr = new originalXhr();

        xhr.addEventListener('readystatechange', function () {
            if (this.readyState === 4) {
                if (this.responseURL.startsWith('https://xs.whggvc.net/scloudoa/scs/course/tCourseTimetableDetail/getCourseTimeTableByWeek')) {
                    try {
                        const status = this.status;
                        const allHeaders = this.getAllResponseHeaders();
                        const responseText = this.responseText;

                        const token = extractToken(allHeaders);

                        console.log('Status:', status);
                        console.log('Token:', token);
                        console.log('原始响应数据:', responseText);

                        const jsonData = JSON.parse(responseText);
                        if (!jsonData.result ||!jsonData.result.records) {
                            console.error('响应数据格式不符合预期，未找到 result 或 records 字段');
                            return;
                        }
                        const dataArray = jsonData.result.records;

                        console.log('解析后的 JSON 数据:', dataArray);
                        
                        // 在处理新的课程数据前，先清除所有现有的自定义课程信息
                        clearAllCustomCourseInfo();

                        const processedData = processCourseData(dataArray);

                        modifyPageElements(processedData);
                    } catch (error) {
                        console.error('处理请求响应时出错:', error);
                    }
                }
            }
        });

        return xhr;
    };

    // 获取设置值，优先从 localStorage 中获取
    function getSettingValue(label) {
        const storedValue = localStorage.getItem(label);
        return storedValue? storedValue : styleSettings.find(setting => setting.label === label).defaultValue;
    }

    // 更新元素样式
    function updateElementStyles() {
        styleSettings.forEach(setting => {
            const value = getSettingValue(setting.label);
            const elements = document.querySelectorAll(`body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.timetable > uni-view.main > uni-view.course-container > uni-view > uni-view > uni-view > ${setting.selector}`);
            if (setting.label.includes('字体大小')) {
                elements.forEach(element => {
                    element.style.fontSize = value;
                });
            } else {
                elements.forEach(element => {
                    element.style.marginTop = value;
                });
            }
        });
    }

    // 丰富（跟着）前一个脚本
    function modifyTargetElement() {
        // 根据路径定位目标元素
        const targetElement = document.querySelector('body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view:nth-child(1) > uni-view > uni-view > uni-view:nth-child(3)');

        if (targetElement && targetElement.textContent!== '个性化') {
            console.log('成功找到目标元素，设置为个性化');
            // 修改元素内容
            targetElement.textContent = "个性化";

            // 创建模态框，复用原有的类名和样式
            const modal = document.createElement('uni-view');
            modal.className = 'u-popup__content';
            modal.style.borderRadius = '6px';
            modal.style.overflow = 'hidden';
            modal.style.marginTop = '100px';
            modal.style.display = 'none';
            modal.style.position = 'fixed';
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%) scale(0.5)';
            modal.style.opacity = '0';
            modal.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            modal.style.zIndex = '9999'; // 添加 z-index 属性，确保模态框显示在最上层
            modal.style.backgroundColor = 'white'; // 添加背景色，确保容器可见
            modal.style.minWidth = '300px'; // 设置最小宽度
            modal.style.maxWidth = '600px'; // 设置最大宽度

            // 创建遮罩层，用于点击空白处关闭弹窗
            const overlay = document.createElement('div');
            overlay.style.display = 'none';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            overlay.style.zIndex = '9998'; // 添加 z-index 属性，确保遮罩层显示在模态框下方
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.addEventListener('click', () => {
                saveSettings();
                closeModal();
            });

            // 创建标题
            const title = document.createElement('uni-text');
            title.className = 'u-modal__title';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = '个性化设置';
            title.appendChild(titleSpan);
            modal.appendChild(title);

            // 创建内容容器
            const content = document.createElement('uni-view');
            content.className = 'u-modal__content';
            content.style.paddingTop = '12px';
            modal.appendChild(content);

            // 创建单元格组
            const cellGroup = document.createElement('uni-view');
            cellGroup.className = 'u-cell-group';
            content.appendChild(cellGroup);

            // 创建单元格组包装器
            const cellGroupWrapper = document.createElement('uni-view');
            cellGroupWrapper.className = 'u-cell-group__wrapper';
            cellGroup.appendChild(cellGroupWrapper);

            styleSettings.forEach((setting) => {
                // 创建分隔线
                const line = document.createElement('uni-view');
                line.className = 'u-line';
                line.style.margin = '0px';
                line.style.borderBottom = '1px solid rgb(214, 215, 217)';
                line.style.width = '100%';
                line.style.transform = 'scaleY(0.5)';
                cellGroupWrapper.appendChild(line);

                // 创建单元格
                const cell = document.createElement('uni-view');
                cell.className = 'u-cell';
                cellGroupWrapper.appendChild(cell);

                // 创建单元格主体
                const cellBody = document.createElement('uni-view');
                cellBody.className = 'u-cell__body u-cell__body--large';
                cell.appendChild(cellBody);

                // 创建单元格内容
                const cellContent = document.createElement('uni-view');
                cellContent.className = 'u-cell__body__content';
                cellBody.appendChild(cellContent);

                // 创建左侧图标包装器
                const leftIconWrap = document.createElement('uni-view');
                leftIconWrap.className = 'u-cell__left-icon-wrap';
                cellContent.appendChild(leftIconWrap);

                // 创建图标
                const icon = document.createElement('uni-view');
                icon.className = 'u-icon u-icon--right';
                leftIconWrap.appendChild(icon);

                // 创建图标文本
                const iconText = document.createElement('uni-text');
                iconText.className = 'u-icon__icon uicon-calendar';
                iconText.style.fontSize = '22px';
                iconText.style.lineHeight = '22px';
                iconText.style.fontWeight = 'normal';
                iconText.style.top = '0px';
                iconText.style.color = 'rgb(255, 170, 0)';
                const iconSpan = document.createElement('span');
                iconSpan.textContent = '';
                iconText.appendChild(iconSpan);
                icon.appendChild(iconText);

                // 创建单元格标题
                const cellTitle = document.createElement('uni-view');
                cellTitle.className = 'u-cell__title';
                cellContent.appendChild(cellTitle);

                // 创建单元格标题文本
                const cellTitleText = document.createElement('uni-text');
                cellTitleText.className = 'u-cell__title-text u-cell__title-text--large';
                const cellTitleSpan = document.createElement('span');
                cellTitleSpan.textContent = setting.label;
                cellTitleText.appendChild(cellTitleSpan);
                cellTitle.appendChild(cellTitleText);

                // 创建输入框
                const input = document.createElement('input');
                input.type = 'number';
                input.value = getSettingValue(setting.label).replace('px', '');
                input.dataset.selector = setting.selector;
                if (setting.label.includes('字体大小')) {
                    input.dataset.styleProp = 'fontSize';
                } else {
                    input.dataset.styleProp = 'marginTop';
                }
                cellTitle.appendChild(input);

                // 实时更新样式
                input.addEventListener('input', function () {
                    const value = this.value + 'px';
                    const selector = this.dataset.selector;
                    const styleProp = this.dataset.styleProp;
                    const elements = document.querySelectorAll(`body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.timetable > uni-view.main > uni-view.course-container > uni-view > uni-view > uni-view > ${selector}`);
                    elements.forEach(element => {
                        element.style[styleProp] = value;
                    });
                });
            });

            // 创建最后一条分隔线
            const lastLine = document.createElement('uni-view');
            lastLine.className = 'u-line';
            lastLine.style.margin = '0px';
            lastLine.style.borderBottom = '1px solid rgb(214, 215, 217)';
            lastLine.style.width = '100%';
            lastLine.style.transform = 'scaleY(0.5)';
            cellGroupWrapper.appendChild(lastLine);

            // 创建按钮组
            const buttonGroup = document.createElement('uni-view');
            buttonGroup.className = 'u-modal__button-group';
            buttonGroup.style.flexDirection = 'row';
            modal.appendChild(buttonGroup);

            // 创建保存按钮
            const saveButton = document.createElement('button');
            saveButton.textContent = '保存';
            saveButton.addEventListener('click', () => {
                saveSettings();
                closeModal();
            });
            buttonGroup.appendChild(saveButton);

            // 创建恢复默认按钮
            const restoreButton = document.createElement('button');
            restoreButton.textContent = '恢复默认';
            restoreButton.addEventListener('click', () => {
                restoreSettings();
                closeModal();
            });
            buttonGroup.appendChild(restoreButton);

            document.body.appendChild(modal);
            document.body.appendChild(overlay);

            // 为目标元素添加点击事件监听器
            targetElement.addEventListener('click', () => {
                openModal();
            });

            // 打开模态框函数
            function openModal() {
                overlay.style.display = 'block';
                setTimeout(() => {
                    overlay.style.opacity = '1';
                }, 10);
                modal.style.display = 'block';
                setTimeout(() => {
                    modal.style.opacity = '1';
                    modal.style.transform = 'translate(-50%, -50%) scale(1)';
                }, 10);
            }

            // 关闭模态框函数
            function closeModal() {
                overlay.style.opacity = '0';
                modal.style.opacity = '0';
                modal.style.transform = 'translate(-50%, -50%) scale(0.5)';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    modal.style.display = 'none';
                }, 300);
            }

            // 保存设置函数
            function saveSettings() {
                const inputs = document.querySelectorAll('input[data-selector]');
                inputs.forEach(input => {
                    const label = input.parentNode.querySelector('.u-cell__title-text span').textContent;
                    const value = input.value + 'px';
                    localStorage.setItem(label, value);
                });
                console.log('保存设置');
            }

            // 恢复默认设置函数
            function restoreSettings() {
                styleSettings.forEach(setting => {
                    localStorage.removeItem(setting.label);
                    const elements = document.querySelectorAll(`body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view.timetable > uni-view.main > uni-view.course-container > uni-view > uni-view > uni-view > ${setting.selector}`);
                    if (setting.label.includes('字体大小')) {
                        elements.forEach(element => {
                            element.style.fontSize = setting.defaultValue;
                        });
                    } else {
                        elements.forEach(element => {
                            element.style.marginTop = setting.defaultValue;
                        });
                    }
                    const input = document.querySelector(`input[data-selector="${setting.selector}"][data-style-prop="${setting.label.includes('字体大小')? 'fontSize' : 'marginTop'}"]`);
                    if (input) {
                        input.value = setting.defaultValue.replace('px', '');
                    }
                });
                console.log('恢复默认设置');
            }
        }
    }

    // 使用 MutationObserver 监听页面变化，检测个性化是否出现
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
                modifyTargetElement();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    // 页面加载时也尝试修改目标元素
    window.addEventListener('load', () => {
        updateElementStyles();
        modifyTargetElement();
    });
    // 使用 MutationObserver 监听页面变化，重新修改目标元素
    // 修改此处选择器
    let targetObservedElement = document.querySelector('body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view:nth-child(1) > uni-view > uni-view > uni-view:nth-child(3)');
    if (targetObservedElement) {
        const observer = new MutationObserver((mutationsList, observerInstance) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    // 修改此处选择器
                    targetObservedElement = document.querySelector('body > uni-app > uni-page > uni-page-wrapper > uni-page-body > uni-view > uni-view:nth-child(1) > uni-view > uni-view > uni-view:nth-child(3)');
                    if (targetObservedElement) {
                        modifyTargetElement();
                    } else {
                        // 如果目标元素不存在，停止观察
                        observerInstance.disconnect();
                    }
                    break;
                }
            }
        });


        // 只观察目标元素及其子节点的变化，减少不必要的触发
        observer.observe(targetObservedElement, { childList: true, attributes: true, subtree: true });
    }

    // 尝试解决个性化按钮在手机端不显示问题
    // 动态调整模态框和遮罩层的样式以适配手机端
    function adjustStylesForMobile() {
        const isMobile = window.innerWidth < 768;
        const modal = document.querySelector('.u-popup__content');
        const overlay = document.querySelector('div[style*="background-color: rgba(0, 0, 0, 0.5)"]');
        if (modal && overlay) {
            if (isMobile) {
                modal.style.minWidth = '90%';
                modal.style.maxWidth = '90%';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            } else {
                modal.style.minWidth = '300px';
                modal.style.maxWidth = '600px';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            }
        }
    }

    // 页面加载时和窗口大小改变时调整样式
    window.addEventListener('load', adjustStylesForMobile);
    window.addEventListener('resize', adjustStylesForMobile);

})();
