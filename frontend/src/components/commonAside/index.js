import React from "react";
import { Menu, Layout } from "antd";
import * as Icon from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import MenuConfig from "../../config";
import { useDispatch } from "react-redux";
import { selectMenuList } from "../../store/reducers/tab";
import "./index.css";

const { Sider } = Layout;

const iconToElement = (name) => React.createElement(Icon[name]);

const generateMenuItems = () => {
  const groupedMenu = [
    {
      groupTitle: "Analytics",
      children: MenuConfig.filter((item) =>
        ["/new", "/user", "/market", "/performance", "/stocksearch", "/news"].includes(item.path)
      ),
    },
    {
      groupTitle: "Your Account",
      children: MenuConfig.filter((item) =>
        ["/edu"].includes(item.path)
      ),
    },
    {
      groupTitle: "Tools",
      children: MenuConfig.find((item) => item.path === "/tools")?.children || [],
    },
  ];

  return groupedMenu.map((group) => ({
    key: group.groupTitle,
    label: <span className="menu-group-title">{group.groupTitle}</span>,
    type: "group",
    children: group.children.map((item) => ({
      key: item.path,
      icon: iconToElement(item.icon),
      label: item.label,
    })),
  }));
};

const CommonAside = ({ collapsed }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const setTabsList = (val) => {
    dispatch(selectMenuList(val));
  };
  const selectMenu = (e) => {
    let selectedItem;
    MenuConfig.forEach((item) => {
      if (item.path === e.key) {
        selectedItem = item;
      }
      if (item.children) {
        const foundChild = item.children.find((child) => child.path === e.key);
        if (foundChild) selectedItem = foundChild;
      }
    });
    if (selectedItem) {
      setTabsList({
        path: selectedItem.path,
        name: selectedItem.name,
        label: selectedItem.label,
      });
      navigate(selectedItem.path);
    }
  };

  return (
    <Sider width={250} collapsed={collapsed} className="aside-container">
      <div className="logo">{collapsed ? "" : "AI Financial Advisor"}</div>
      <Menu
        mode="inline"
        theme="dark"
        items={generateMenuItems()}
        onClick={selectMenu}
        style={{ height: "100%" }}
      />
    </Sider>
  );
};

export default CommonAside;