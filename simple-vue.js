/*
 * @author: xiejiaxin
 * @Date: 2021-01-06 20:33:46
 * @LastEditors: xiejiaxin
 * @LastEditTime: 2021-01-10 12:19:04
 * @description: file content
 */

// 第一步：将vm.$data上面的属性，转发到vue上面，也就是能够通过this.xx直接拿到该属性
// 第二步：查找dom节点，找出vue指令（v-xxx），{{}}符号等，进行初始化的赋值
// 第三步：对$data进行数据劫持，就是能够监听到$data上面数据的变化（getter、setter）---通过递归处理
    // 处理数据get：需要收集依赖，在get的时候，添加上对应的watcher（转交给Dep对象）
    // 处理set：更新数据后，需要通知一系列watcher更新dom模板（转交给Dep对象
const utils = {
    getValue(expr, vm) {
        return vm.$data[expr.trim()];
    },
    setValue(expr, vm, newVal) {
        vm.$data[expr] = newVal;
    },
    model(node, value, vm) {
        const initValue = this.getValue(value, vm);
        new Watcher(value, vm, (newVal) => {
            this.modelUpdater(node, newVal);
        })
        // 绑定数据
        node.addEventListener('input', e => {
            const newVal = e.target.value;
            this.setValue(value, vm, newVal);
        });
        this.modelUpdater(node, initValue);
    },
    text(node, value, vm) {
        let result;
        if (value.includes('{{')) {
            // {{xx}}
            result = value.replace(/\{\{(.+)\}\}/g, (...args) => {
                const expr = args[1];
                // v-text或者是{{}}方式，都需要在compile的时候先进行依赖收集，就是遇到指令，就绑定一个watcher，监听data变化后，给dom节点也更新值
                new Watcher(expr, vm, (newVal) => {
                    this.textUpdater(node, newVal);
                });
                return this.getValue(args[1], vm);
            })
        } else {
            // v-text = 'msg'
            result = this.getValue(value, vm);
        }
        // watcher初始绑定不会调用cb回调函数，所以这个地方这个方法还是存在
        this.textUpdater(node, result);
    },
    textUpdater(node, value) {
        node.textContent = value;
    },
    modelUpdater(node, value) {
        node.value = value;
    },
    on(node, value, vm, eventName) {
        const fn = vm.$options.methods[value];
        document.addEventListener(eventName, fn.bind(vm), false);
    }
}
// 收集dom依赖，根据data的变化来更新dom节点内容
class Watcher {
    constructor(expr, vm, cb) {
        this.expr = expr;
        this.vm = vm;
        this.cb = cb;
        // 触发一次get方法，进行watcher绑定，不然没有时机进行绑定啊
        this.oldValue = this.getOldValue();
    }
    getOldValue() {
        // 这个Dep.target可以随意替换成一个全局变量
        Dep.target = this;
        const oldValue = utils.getValue(this.expr, this.vm);
        Dep.target = null;
        return oldValue;
    }
    update() {
        const newValue = utils.getValue(this.expr, this.vm);
        if (newValue !== this.oldValue) {
            this.cb(newValue);
        }
    }
}

// 将dom和watcher进行绑定，一个dep可以对应多个watcher
class Dep {
    constructor() {
        this.collect = [];
    }
    
    addWatcher(watcher) {
        this.collect.push(watcher);
    }

    notify() {
        this.collect.forEach(w => w.update());
    }
}

// 从根开始查找dom节点，找出指令v-xx或者是{{}}，修改data上面绑定的值，或者根据data上面的值，对dom进行赋值
class Compiler {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        // 使用fragment进行模拟，防止更新节点导致页面重绘或者回流
        const fragment = this.compileFragment(this.el);
        // 处理fragment内容，找出{{}}、v-XXX等内容，进行更新
        this.compile(fragment);
        // 把fragment的内容 正式 放入到html中
        this.el.appendChild(fragment);
    }
    compile(fragment) {
        const childNodes = Array.from(fragment.childNodes);
        childNodes.forEach(childNode => {
            if (this.isElementNode(childNode)) {
                // 是标签节点，需要读取属性来检查，查找类似 input/h1，是否具有v-XXX等属性（v-model、v-html）
                this.compileElement(childNode);
            } else if (this.isTextNode(childNode)) {
                // text节点，查找类似{{msg}}
                this.compileText(childNode);
            }
            // DFS深度遍历算法，深度递归
            if (childNode.childNodes && childNode.childNodes.length > 0) {
                this.compile(childNode);
            }
        });
    }
    compileElement(node) {
        // v-XX ==>  v-model v-text v-on:click
        const attributes = Array.from(node.attributes);
        attributes.forEach(attr => {
            const {name, value} = attr;
            // console.log(name, value)
            if (this.isDirector(name)) {
                // 指令 v-model v-text v-bind v-on:click
                const [, directive] = name.split('-');
                const [compileKey, eventName] = directive.split(':');
                // console.log(compileKey, eventName)
                utils[compileKey](node, value, this.vm, eventName);
            } else if (this.isEventName(name)) {
                const [, eventName] = name.split('@');
                utils['on'](node, value, this.vm, eventName);
            }
        });
    }
    isEventName(name) {
        return name.startsWith('@');
    }
    isDirector(name) {
        // 判断是否是v-开头
        return name.startsWith('v-');
    }
    compileText(node) {
        // {{msg}} v-text
        const content = node.textContent;
        if (/\{\{(.+)\}\}/.test(content)) {
            // console.log('content', content)
            utils['text'](node, content, this.vm);
        }
    }
    compileFragment(el) {
        const f = document.createDocumentFragment();
        let firstChild;
        // while(firstChild = el.firstChild) ==> 1、firstChild = el.firstChild 2、while(firstChild)
        while(firstChild = el.firstChild) {
            // appendChild会删除原本节点中，插入到其他dom的元素
            f.appendChild(firstChild);
        }
        // console.dir(f)
        return f;
    }
    isTextNode(node) {
        return node.nodeType === 3;
    }
    isElementNode(el) {
        // nodeType为1，表示是一个dom节点
        return el.nodeType === 1;
    }
}
// 给data上面的值进行绑定处理，监听值的变化
class Observer {
    constructor(data) {
        this.observe(data);
    }
    observe(data) {
        if (data && typeof data === 'object') {
            // 对$data下面所有属性进行劫持
            Object.keys(data).forEach(key => {
                this.defineReactive(data, key, data[key]);
            })
        }
    }
    defineReactive(obj, key, value) {
        // 递归处理，防止当前的value是一个对象
        this.observe(value);
        const dep = new Dep();
        // 对平行曾进行监听绑定
        Object.defineProperty(obj, key, {
            get() {
                // 在get的时候需要添加依赖，把这个值应该绑定的watcher添加上
                const target = Dep.target;
                target && dep.addWatcher(target);
                console.log('get====' + value)
                return value;
            },
            set: (newVal) => {
                if (newVal === value) return;
                this.observe(newVal);
                console.log('set=====' + newVal)
                value = newVal;
                // 更新值后，通知watcher更新
                dep.notify();
            }
        })
    }
}
class Vue {
    constructor(options) {
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;

        // 监听$data下所有属性的变化
        new Observer(this.$data);
        // 处理模板，将模板和$data绑定起来，做到数据更新，html内容也跟着更新
        new Compiler(this.$el, this);
        // 将$data上面的属性都转发到this上面，可以支持vm.msg
        this.proxyData(this.$data);
    }
    // 将$data上面的属性都转发到this上面，可以支持vm.msg修改，导致this.$data也被修改
    proxyData(data) {
        Object.keys(data).forEach(key => {
            Object.defineProperty(this, key, {
                get() {
                    return data[key];
                },
                set(newVal) {
                    data[key] = newVal;
                }
            })
        })
    }
}