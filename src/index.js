import { useState, useRef, useEffect, unstable_batchedUpdates } from "react";

let RN_unstable_batchedUpdates = null;
(function () {
  try {
    const { unstable_batchedUpdates } = import("react-native");
    RN_unstable_batchedUpdates = unstable_batchedUpdates;
  } catch (e) {
    console.log("当前不是RN环境");
  }
})();
export default class UpdateManager {
  batchUpdate = (fn) => {
    fn();
  };

  constructor(datas, config = {}) {
    // 记录path对应渲染节点的表
    this.updateCallback = {};
    this.deep = true;
    this._datas = datas || {};
    this.config = {
      reactiveParent: true, // 更新一个路径时，父路径数据的更新是否会导致子路径的组件更新
      ...config,
    };
    this.batchUpdate =
      RN_unstable_batchedUpdates || unstable_batchedUpdates || this.batchUpdate;
  }

  set datas(val) {
    console.log("_datas 是只读的");
  }

  get datas() {
    return this._datas;
  }

  setState = (obj) => {
    if (!obj || typeof obj !== "object") {
      return;
    }
    Object.keys(obj).forEach((path) => {
      this.updateState(path, obj[path]);
    });
  };

  splitPath(path) {
    return path
      .replace(/(\[|\]|'|")/gi, ".")
      .split(".")
      .filter((e) => e)
      .map((e) => (/^[0-9]+$/.test(e) ? parseInt(e) : e));
  }

  setData = (path, val) => {
    const arr = Array.isArray(path) ? path : this.splitPath(path);
    let currObj = this._datas;
    const len = arr.length;
    let currIndex = 0;
    for (const key of arr) {
      ++currIndex;
      if (!currObj) {
        return;
      }

      if (currIndex >= len) {
        currObj[key] = val;
        console.log("curr", key, currIndex, len, val);
        break;
      }
      if (currObj[key] && typeof currObj[key] === "object") {
        currObj = currObj[key];
      }
    }
  };

  getData = (path) => {
    const arr = Array.isArray(path) ? path : this.splitPath(path);
    let target = this._datas;
    let currPath = "root";
    let count = 0;
    let res;
    for (const key of arr) {
      currPath += "/" + key;
      ++count;
      if (
        this.isCollect &&
        (this.config.reactiveParent || count >= arr.length)
      ) {
        this.currDeps.push({
          path: currPath,
          pname: key,
        });
      }
      if (target[key] === null || target[key] === undefined) {
        return;
      }
      if (count === arr.length) {
        res = target[key];
      } else if (typeof target[key] === "object" && target[key] !== null) {
        target = target[key];
      } else {
        return;
      }
    }
    return res;
  };

  updateState = (path, val) => {
    const arr = path
      .replace(/(\[|\]|'|")/gi, ".")
      .split(".")
      .filter((e) => e);
    const p = "root/" + arr.join("/");
    const pre = this.getData(path);
    this.setData(path, val);
    if (pre !== val) {
      this.update(p);
    }
  };

  collectStart = () => {
    this.isCollect = true;
    this.currDeps = [];
  };

  collectEnd = () => {
    this.isCollect = false;
    this.currDeps = [];
  };

  countId = 0;
  useDeps = (deps) => {
    // 为每个组件生成独一无二的key
    const ref = useRef("component_" + this.countId++).current;
    const [_, set_] = useState({});
    const res = {};
    if (!this.updateCallback[ref]) {
      this.updateCallback[ref] = {
        update: () => {
          set_({});
        },
        deps: [],
      };
    }
    useEffect(() => {
      return () => {
        this.updateCallback[ref] = undefined;
        delete this.updateCallback[ref];
      };
    }, []);
    const temp = [];
    for (const key in deps) {
      const func = deps[key];
      if (typeof func !== "function") {
        return;
      }
      const val = useRef(null);
      // 开始收集依赖
      this.collectStart();
      val.current = func(this.getData);
      temp.push(...this.currDeps.map((el) => el.path));

      // 结束依赖收集
      this.collectEnd();

      res[key] = val.current;
    }

    if (this.updateCallback[ref]) {
      this.updateCallback[ref].deps = temp;
    }

    return res;
  };

  updateHandle = null;
  updates = [];
  update = async (p) => {
    for (const ref of Object.keys(this.updateCallback)) {
      const arr = this.updateCallback[ref].deps;
      if (Array.isArray(arr) && arr.includes(p)) {
        this.updates.push(this.updateCallback[ref]);
      }
    }
    if (!this.updateHandle) {
      this.updateHandle = setTimeout(() => {
        this.batchUpdate(() => {
          for (const el of this.updates) {
            el.update();
          }
          this.updateHandle = null;
          this.updates = [];
        });
      });
    }
  };
}
