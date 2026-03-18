/**
 * MilSymbSizeSlider – Toolbar-integrated plugin that opens a SideBar panel
 * with a slider to control the rendering size of military symbol (milsymb)
 * icons on the map.
 *
 * Activated from the TopBar menu (key: "MilSymbSizeSlider") or via the
 * QWC2 task system.  Only visible when the current theme has milsymb layers.
 *
 * The chosen size is broadcast via the CustomEvent "milsymb-size-change"
 * (detail = {size: Number}), which MilSymbSupport listens to in order to
 * re-style all point features.
 *
 * Range: 10 – 80 px   (default: 40)
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {setCurrentTask} from 'qwc2/actions/task';
import SideBar from 'qwc2/components/SideBar';

import './style/MilSymbSizeSlider.css';

const MIN_SIZE = 10;
const MAX_SIZE = 80;
const DEFAULT_SIZE = 40;

class MilSymbSizeSlider extends React.Component {
    static propTypes = {
        active: PropTypes.bool,
        setCurrentTask: PropTypes.func,
        /** Side of the screen for the sidebar panel. */
        side: PropTypes.string,
        theme: PropTypes.object
    };

    static defaultProps = {
        side: 'right'
    };

    constructor(props) {
        super(props);
        this.state = {
            size: DEFAULT_SIZE
        };
    }

    hasMilSymbLayers = () => {
        const ml = this.props.theme?.milsymbLayers;
        return ml && ml.length > 0;
    };

    onSizeChange = (ev) => {
        const size = parseInt(ev.target.value, 10);
        this.setState({size});
        window.dispatchEvent(new CustomEvent('milsymb-size-change', {detail: {size}}));
    };

    renderBody = () => {
        return (
            <div className="milsymb-sidebar-body">
                <div className="milsymb-sidebar-section">
                    <div className="milsymb-sidebar-preview">
                        <span className="milsymb-preview-icon" style={{fontSize: this.state.size + 'px'}}>
                            &#x2B23;
                        </span>
                        <span className="milsymb-preview-size">{this.state.size} px</span>
                    </div>
                    <label className="milsymb-sidebar-label">
                        Symbol size
                    </label>
                    <input
                        className="milsymb-sidebar-range"
                        max={MAX_SIZE}
                        min={MIN_SIZE}
                        onChange={this.onSizeChange}
                        type="range"
                        value={this.state.size}
                    />
                    <div className="milsymb-sidebar-ticks">
                        <span>{MIN_SIZE} px</span>
                        <span>{MAX_SIZE} px</span>
                    </div>
                </div>
            </div>
        );
    };

    render() {
        // Don't render the sidebar at all when the theme has no milsymb layers
        if (!this.hasMilSymbLayers()) {
            return null;
        }

        return (
            <SideBar icon="resize" id="MilSymbSizeSlider"
                side={this.props.side}
                title="Symbol Size"
                width="18em">
                {() => ({
                    body: this.renderBody()
                })}
            </SideBar>
        );
    }
}

export default connect((state) => ({
    active: state.task.id === 'MilSymbSizeSlider',
    theme: state.theme?.current
}), {
    setCurrentTask: setCurrentTask
})(MilSymbSizeSlider);
